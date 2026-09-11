import type { CustomBackgroundImageId } from "@t3tools/contracts";
import { ImageIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { type DragEvent, useEffect, useRef, useState } from "react";

import {
  CUSTOM_BACKGROUND_ACCEPTED_TYPES,
  deleteBackgroundImage,
  listBackgroundImages,
  type StoredBackgroundImage,
  subscribeBackgroundImages,
  useBackgroundImageUrl,
} from "~/customBackground/imageStore";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Menu, MenuPopup, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const BACKGROUND_FILE_ACCEPT = CUSTOM_BACKGROUND_ACCEPTED_TYPES.join(",");
const BACKGROUND_FILE_TYPES_LABEL = CUSTOM_BACKGROUND_ACCEPTED_TYPES.map((type) =>
  type.replace("image/", "").toUpperCase(),
).join(", ");

export function backgroundStudioFieldClass(className?: string): string {
  return cn(
    "relative inline-flex h-7.5 min-w-0 w-full flex-1 items-center rounded-lg border border-input bg-background text-sm text-foreground shadow-xs/5 outline-none not-dark:bg-clip-padding ring-ring/24 transition-shadow sm:h-6.5",
    "before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)]",
    "not-has-disabled:not-has-focus-visible:not-focus-visible:before:shadow-[0_1px_--theme(--color-black/4%)] dark:not-has-disabled:not-has-focus-visible:not-focus-visible:before:shadow-[0_-1px_--theme(--color-white/6%)]",
    "has-focus-visible:border-ring has-focus-visible:ring-[3px] focus-visible:border-ring focus-visible:ring-[3px]",
    "has-[:disabled,:focus-visible]:shadow-none focus-visible:shadow-none",
    "has-disabled:opacity-64 disabled:opacity-64",
    "dark:bg-input/32",
    className,
  );
}

export function backgroundPickerTileClass(selected: boolean): string {
  return cn(
    "block w-full overflow-hidden rounded-lg border outline-none focus-visible:ring-2 focus-visible:ring-ring",
    selected ? "border-primary ring-2 ring-primary/40" : "border-border/60 hover:border-border",
  );
}

export const backgroundPickerMenuGridClass = "grid max-h-72 grid-cols-3 overflow-y-auto p-2";

export const backgroundPickerDeleteButtonClass =
  "absolute right-1 top-1 bg-popover opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100";

function useStoredBackgroundImages(): ReadonlyArray<StoredBackgroundImage> | null {
  const [images, setImages] = useState<ReadonlyArray<StoredBackgroundImage> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void listBackgroundImages()
        .then((next) => {
          if (!cancelled) setImages(next);
        })
        .catch(() => {
          if (!cancelled) setImages([]);
        });
    };
    refresh();
    const unsubscribe = subscribeBackgroundImages(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  return images;
}

export function BackgroundThumbnail({
  imageId,
  className,
}: {
  imageId: CustomBackgroundImageId | null;
  className?: string;
}) {
  const url = useBackgroundImageUrl(imageId, "thumbnail");
  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden bg-muted text-muted-foreground",
        className,
      )}
    >
      {typeof url === "string" ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <ImageIcon className="size-4" />
      )}
    </div>
  );
}

export function BackgroundImagePicker({
  selectedImageId,
  referencedImageIds,
  onSelect,
  onUpload,
  busy,
}: {
  selectedImageId: CustomBackgroundImageId | null;
  referencedImageIds: ReadonlySet<string>;
  onSelect: (imageId: CustomBackgroundImageId) => void;
  onUpload: (file: File) => void;
  busy: boolean;
}) {
  const images = useStoredBackgroundImages();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [dragTarget, setDragTarget] = useState<"input" | "upload" | null>(null);

  function uploadFile(file: File) {
    if (busy) return;
    setOpen(false);
    onUpload(file);
  }

  function handleDragOver(event: DragEvent<HTMLButtonElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = busy ? "none" : "copy";
    if (!busy) {
      setDragTarget(event.currentTarget.dataset.dropTarget === "input" ? "input" : "upload");
    }
  }

  function handleDragLeave(event: DragEvent<HTMLButtonElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setDragTarget(null);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    setDragTarget(null);
    const file = event.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  const dropHandlers = {
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  };

  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-[13px] text-muted-foreground">Image</span>
      <input
        ref={inputRef}
        type="file"
        accept={BACKGROUND_FILE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="Background image file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) {
            uploadFile(file);
          }
        }}
      />
      <Menu open={open} onOpenChange={setOpen}>
        <MenuTrigger
          render={
            <button
              type="button"
              {...dropHandlers}
              data-drop-target="input"
              data-dragging={dragTarget === "input"}
              className={backgroundStudioFieldClass(
                "cursor-pointer justify-start gap-2 px-[calc(--spacing(2.5)-1px)] data-[dragging=true]:border-primary data-[dragging=true]:bg-primary/10",
              )}
            >
              <BackgroundThumbnail imageId={selectedImageId} className="size-5 rounded-sm" />
              <span className="truncate">
                {selectedImageId === null
                  ? "Choose image…"
                  : busy
                    ? "Preparing image…"
                    : "Change image…"}
              </span>
            </button>
          }
        />
        <MenuPopup align="end" className="w-80">
          <div className={cn(backgroundPickerMenuGridClass, "gap-2")}>
            <button
              type="button"
              disabled={busy}
              {...dropHandlers}
              data-drop-target="upload"
              data-dragging={dragTarget === "upload"}
              onClick={() => inputRef.current?.click()}
              className="col-span-full flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground outline-none hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-[dragging=true]:border-primary data-[dragging=true]:bg-primary/10"
            >
              <UploadIcon className="size-4" />
              <span>Upload or drop an image</span>
              <span className="text-[11px]">{BACKGROUND_FILE_TYPES_LABEL}</span>
            </button>
            {images?.map((image) => (
              <div key={image.id} className="group relative">
                <button
                  type="button"
                  aria-label={`Use image ${image.width}×${image.height}`}
                  aria-pressed={image.id === selectedImageId}
                  onClick={() => {
                    setOpen(false);
                    onSelect(image.id);
                  }}
                  className={backgroundPickerTileClass(image.id === selectedImageId)}
                >
                  <BackgroundThumbnail imageId={image.id} className="aspect-[4/3] w-full" />
                </button>
                {!referencedImageIds.has(image.id) ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon-micro"
                          variant="outline"
                          className={backgroundPickerDeleteButtonClass}
                          aria-label="Delete unused image"
                          onClick={() => void deleteBackgroundImage(image.id)}
                        >
                          <Trash2Icon />
                        </Button>
                      }
                    />
                    <TooltipPopup side="top">Delete unused image</TooltipPopup>
                  </Tooltip>
                ) : null}
              </div>
            ))}
          </div>
        </MenuPopup>
      </Menu>
    </div>
  );
}
