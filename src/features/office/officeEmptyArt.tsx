import { PixelArt } from './components/PixelArt'
import type { PixelGrid } from './officeSprites'
export type EmptyArtKind = 'desk' | 'tray' | 'board' | 'mailbox'
const maps: Record<EmptyArtKind, string[]> = {
  desk: ['................','...kkkkkkkk.....','...kppppppk.....','...kppppppk.....','...kkkkkkkk.....','......kk........','.kkkkkkkkkkkkkk.','.kppppppppppppk.','.kkkkkkkkkkkkkk.','..kk........kk..','..kk........kk..','..kk........kk..'],
  tray: ['................','.....kkkkkk.....','.....kppppk.....','....kkkkkkkk....','....kppppppk....','...kkkkkkkkkk...','...kppppppppk...','.kkkkkkkkkkkkkk.','.kyyyyyyyyyyyyk.','.kkkkkkkkkkkkkk.','................','................'],
  board: ['.kkkkkkkkkkkkkk.','.kppppppppppppk.','.kpyyyppppppppk.','.kpyyyppkkkpppk.','.kppppppppppppk.','.kppkkkppyypppk.','.kpppppppyypppk.','.kkkkkkkkkkkkkk.','....kk....kk....','....kk....kk....','................','................'],
  mailbox: ['................','....kkkkkkkk....','...kppppppppk...','..kppppppppppk..','..kppkkkkkkppk..','..kppppppppppk..','..kpppppyypppk..','..kkkkkkkkkkkk..','.......kk.......','.......kk.......','.....kkkkkk.....','................'],
}
const palette: Record<string, string> = { k: 'var(--pixel-frame)', p: 'var(--paper-panel)', y: 'var(--brand-yellow)' }
export function OfficeEmptyArt({ kind }: { kind: EmptyArtKind }) {
  const rows = maps[kind]
  const grid: PixelGrid = { width: 16, height: 16, pixels: [...rows.join('') + '.'.repeat(64)].map(c => palette[c] ?? null) }
  return <PixelArt grid={grid} className={kind === 'mailbox' ? 'pixel-mailbox-art' : 'pixel-empty-art'} />
}
