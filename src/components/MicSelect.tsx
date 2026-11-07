import type { VoiceInputDevice } from '../alethe'

type Props = {
  className?: string
  devices: VoiceInputDevice[]
  value: string | null
  defaultLabel: string
  ariaLabel: string
  disabled?: boolean
  onChange: (device: VoiceInputDevice | null) => void
}

export function MicSelect({
  className,
  devices,
  value,
  defaultLabel,
  ariaLabel,
  disabled,
  onChange,
}: Props) {
  return (
    <select
      className={className}
      value={value ?? ''}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(event) =>
        onChange(devices.find((device) => device.deviceId === event.target.value) ?? null)
      }
    >
      <option value="">{defaultLabel}</option>
      {devices.map((device) => (
        <option key={device.deviceId} value={device.deviceId}>
          {device.label}
        </option>
      ))}
    </select>
  )
}
