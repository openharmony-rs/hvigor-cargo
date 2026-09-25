//! A Node-API module exposing `greeting(name: string): string` to ArkTS, written against the raw
//! C API so the example needs no dependencies.

use std::ffi::{c_char, c_void};
use std::ptr;

type NapiEnv = *mut c_void;
type NapiValue = *mut c_void;
type NapiCallbackInfo = *mut c_void;
type NapiStatus = i32;
type NapiCallback = unsafe extern "C" fn(NapiEnv, NapiCallbackInfo) -> NapiValue;

#[repr(C)]
struct NapiModule {
    nm_version: i32,
    nm_flags: u32,
    nm_filename: *const c_char,
    nm_register_func: unsafe extern "C" fn(NapiEnv, NapiValue) -> NapiValue,
    nm_modname: *const c_char,
    nm_priv: *mut c_void,
    reserved: [*mut c_void; 4],
}

#[link(name = "ace_napi.z")]
extern "C" {
    fn napi_module_register(module: *mut NapiModule);
    fn napi_create_function(
        env: NapiEnv,
        name: *const c_char,
        length: usize,
        cb: NapiCallback,
        data: *mut c_void,
        result: *mut NapiValue,
    ) -> NapiStatus;
    fn napi_set_named_property(
        env: NapiEnv,
        object: NapiValue,
        name: *const c_char,
        value: NapiValue,
    ) -> NapiStatus;
    fn napi_get_cb_info(
        env: NapiEnv,
        info: NapiCallbackInfo,
        argc: *mut usize,
        argv: *mut NapiValue,
        this_arg: *mut NapiValue,
        data: *mut *mut c_void,
    ) -> NapiStatus;
    fn napi_get_value_string_utf8(
        env: NapiEnv,
        value: NapiValue,
        buf: *mut c_char,
        bufsize: usize,
        result: *mut usize,
    ) -> NapiStatus;
    fn napi_create_string_utf8(
        env: NapiEnv,
        str: *const c_char,
        length: usize,
        result: *mut NapiValue,
    ) -> NapiStatus;
}

unsafe extern "C" fn greeting(env: NapiEnv, info: NapiCallbackInfo) -> NapiValue {
    let mut argc = 1;
    let mut arg = ptr::null_mut();
    napi_get_cb_info(env, info, &mut argc, &mut arg, ptr::null_mut(), ptr::null_mut());
    let mut name = [0u8; 256];
    let mut len = 0;
    napi_get_value_string_utf8(env, arg, name.as_mut_ptr().cast(), name.len(), &mut len);
    let text = format!(
        "Hello {}, from Rust on {}",
        String::from_utf8_lossy(&name[..len]),
        std::env::consts::ARCH
    );
    let mut result = ptr::null_mut();
    napi_create_string_utf8(env, text.as_ptr().cast(), text.len(), &mut result);
    result
}

unsafe extern "C" fn init(env: NapiEnv, exports: NapiValue) -> NapiValue {
    let mut function = ptr::null_mut();
    napi_create_function(env, c"greeting".as_ptr(), usize::MAX, greeting, ptr::null_mut(), &mut function);
    napi_set_named_property(env, exports, c"greeting".as_ptr(), function);
    exports
}

static mut MODULE: NapiModule = NapiModule {
    nm_version: 1,
    nm_flags: 0,
    nm_filename: ptr::null(),
    nm_register_func: init,
    nm_modname: c"hello".as_ptr(),
    nm_priv: ptr::null_mut(),
    reserved: [ptr::null_mut(); 4],
};

extern "C" fn register() {
    unsafe { napi_module_register(ptr::addr_of_mut!(MODULE)) }
}

#[used]
#[link_section = ".init_array"]
static REGISTER: extern "C" fn() = register;
