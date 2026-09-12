/**
 * Next는 쿼리 파라미터가 반복되면(`?q=a&q=b`) searchParams 값을
 * string 대신 string[] 로 준다. 이를 모르고 .trim() 등을 바로 호출하면
 * 에러 바운더리로 떨어진다. 배열이면 첫 값만 취한다.
 */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}
