export interface Diagnostic {
  readonly columnIndex: number
  readonly endColumnIndex: number
  readonly endRowIndex: number
  readonly message: string
  readonly rowIndex: number
  readonly source: string
  readonly type: 'error' | 'warning'
  readonly uri: string
}

export interface ExpectedDiagnostic {
  readonly columnIndex: number
  readonly message: string
  readonly rowIndex: number
  readonly source: string
  readonly type: 'error' | 'warning'
}

export const expectedDiagnostic: ExpectedDiagnostic = {
  columnIndex: 0,
  message: "Unexpected 'debugger' statement.",
  rowIndex: 0,
  source: 'no-debugger',
  type: 'error',
}

export const validateDiagnostics = (
  value: unknown,
  uri: string,
): readonly Diagnostic[] => {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error(`Expected one ESLint diagnostic; got ${JSON.stringify(value)}`)
  }
  const [diagnostic] = value as Diagnostic[]
  if (
    !diagnostic ||
    diagnostic.columnIndex !== expectedDiagnostic.columnIndex ||
    diagnostic.message !== expectedDiagnostic.message ||
    diagnostic.rowIndex !== expectedDiagnostic.rowIndex ||
    diagnostic.source !== expectedDiagnostic.source ||
    diagnostic.type !== expectedDiagnostic.type ||
    diagnostic.uri !== uri
  ) {
    throw new Error(`Unexpected ESLint diagnostic: ${JSON.stringify(value)}`)
  }
  return [diagnostic]
}
