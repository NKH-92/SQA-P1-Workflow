import { pixelIconGrid, type PixelIconId } from '../officePixelIcons'
import { PixelArt } from './PixelArt'

/** 사무실 자리 표지와 같은 12×12 도트 아이콘(휴가·출장·회의·현장·실험실·부재·자리에 있음) */
export function PixelIcon({ id, className }: { id: PixelIconId; className?: string }) {
  return <PixelArt className={className ? `pixel-icon ${className}` : 'pixel-icon'} grid={pixelIconGrid(id)} />
}
