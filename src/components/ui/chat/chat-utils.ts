type DiffKind = 'unchanged' | 'removed' | 'added'

export interface DiffLine {
  key: string
  kind: DiffKind
  text: string
}

export const buildSimpleDiff = (currentText: string, proposedText: string): DiffLine[] => {
  const currentLines = currentText.split(/\r?\n/)
  const proposedLines = proposedText.split(/\r?\n/)
  const maxLength = Math.max(currentLines.length, proposedLines.length)
  const output: DiffLine[] = []

  for (let index = 0; index < maxLength; index += 1) {
    const currentLine = currentLines[index]
    const proposedLine = proposedLines[index]

    if (currentLine === proposedLine && currentLine !== undefined) {
      output.push({ key: `same-${index}`, kind: 'unchanged', text: currentLine })
      continue
    }

    if (currentLine !== undefined) {
      output.push({ key: `removed-${index}`, kind: 'removed', text: currentLine })
    }

    if (proposedLine !== undefined) {
      output.push({ key: `added-${index}`, kind: 'added', text: proposedLine })
    }
  }

  return output
}

export const previewContent = (value: string, maxChars = 320): string => {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}…`
}
