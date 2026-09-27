// jsdom에는 캔버스 구현이 없다(canvas 패키지를 설치하지 않았다). 그대로 두면 getContext를 부를 때마다
// "Not implemented" 오류가 찍힌다. 홈 도트 사무실은 2D 컨텍스트가 없으면 그리지 않고 넘어가므로,
// 테스트에서는 컨텍스트가 없다고 조용히 알려 준다.
if (typeof HTMLCanvasElement !== 'undefined') {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: () => null,
  })
}
