import { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { X, Smile } from 'lucide-react';

interface StickerPack {
  id: string;
  name: string;
  stickers: Array<{ id: number; url: string; alt: string; packId: string }>;
}

interface StickerPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSticker: (sticker: string) => void;
  token: string;
}

export const StickerPicker = ({ isOpen, onClose, onSelectSticker, token }: StickerPickerProps) => {
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [activePackId, setActivePackId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && packs.length === 0) {
      setLoading(true);
      fetch("/api/stickers", {
        headers: { "Authorization": `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          setPacks(data.packs || []);
          if (data.packs?.[0]) setActivePackId(data.packs[0].id);
        })
        .catch(err => console.error("Sticker fetch error:", err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, token, packs.length]);

  if (!isOpen) return null;

  const activePack = packs.find(p => p.id === activePackId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
      <div className="bg-background w-full max-w-lg rounded-t-lg shadow-xl border-t border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Smile className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Stickers</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sticker Grid */}
        {loading ? (
          <div className="p-12 text-center text-muted-foreground">Memuat stiker...</div>
        ) : activePack ? (
          <div className="p-4 max-h-64 overflow-y-auto">
            <div className="grid grid-cols-6 gap-3">
              {activePack.stickers.map(sticker => (
                <button
                  key={sticker.id}
                  onClick={() => {
                    onSelectSticker(sticker.url);
                    onClose();
                  }}
                  className="text-4xl hover:scale-110 transition-transform active:scale-95"
                  title={sticker.alt}
                >
                  {sticker.url}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Pack Tabs */}
        {packs.length > 0 && (
          <div className="flex gap-2 p-3 border-t border-border overflow-x-auto">
            {packs.map(pack => (
              <button
                key={pack.id}
                onClick={() => setActivePackId(pack.id)}
                className={cn(
                  "px-4 py-2 rounded-lg transition-colors whitespace-nowrap",
                  activePackId === pack.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80"
                )}
              >
                {pack.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
