import hello from 'libhello.so';

@Entry
@Component
struct Index {
  build() {
    Column() {
      Text(hello.greeting('ArkTS'))
        .fontSize(32)
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
  }
}
