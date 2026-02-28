import React from 'react'

interface ChatVariantPickerProps {
  turnId: string
  variantOrdinals: number[]
  visibleOrdinal: number | null
  onSelectViewingVariant: (ordinal: number) => void
  onUseForFutureReplies: (ordinal: number) => Promise<void>
}

export const ChatVariantPicker = ({
  turnId,
  variantOrdinals,
  visibleOrdinal,
  onSelectViewingVariant,
  onUseForFutureReplies,
}: ChatVariantPickerProps) => {
  const variantCount = variantOrdinals.length
  if (variantCount <= 1) return null

  return (
    <>
      <label className="text-[11px] font-semibold text-slate-600" htmlFor={`variant-${turnId}`}>
        {`${(visibleOrdinal ?? 0) + 1}/${variantCount}`}
      </label>
      <select
        id={`variant-${turnId}`}
        value={visibleOrdinal ?? 0}
        onChange={(event) => {
          onSelectViewingVariant(Number(event.target.value))
        }}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700"
      >
        {variantOrdinals.map((ordinal) => (
          <option key={`${turnId}-${ordinal}`} value={ordinal}>
            {`Variant ${ordinal + 1}`}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => {
          if (visibleOrdinal === null) return
          void onUseForFutureReplies(visibleOrdinal)
        }}
        className="rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
      >
        Use for future replies
      </button>
    </>
  )
}
