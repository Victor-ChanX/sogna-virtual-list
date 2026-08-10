export function approximatelyEqual(num1: number, num2: number, epsilon = 1.01) {
  return Math.abs(num1 - num2) < epsilon;
}
