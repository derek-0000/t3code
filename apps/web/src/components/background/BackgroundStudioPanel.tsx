import {
  CUSTOM_BACKGROUND_IMAGE_FILTERS,
  CUSTOM_BACKGROUND_GENERATIVE_FILTERS,
  CUSTOM_BACKGROUND_NAME_MAX_LENGTH,
  type CustomBackgroundFilterKind,
  type CustomBackgroundRecord,
  MAX_CUSTOM_BACKGROUND_FADE,
  MIN_CUSTOM_BACKGROUND_FADE,
  defaultCustomBackgroundFilter,
  isGenerativeCustomBackgroundFilter,
} from "@t3tools/contracts";
import {
  BanIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XIcon,
  ChevronsUpDownIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBackgroundStudioStore } from "~/customBackground/backgroundStudioStore";
import { storeBackgroundImage } from "~/customBackground/imageStore";
import {
  type CustomBackgroundLibrary,
  createGenerativeBackground,
  filtersEqual,
  nextActiveAfterRemove,
  nextNewBackgroundName,
  removeBackground,
  upsertBackground,
  withFilterKind,
} from "~/customBackground/records";
import { getClientSettings, useClientSettings, useUpdateClientSettings } from "~/hooks/useSettings";
import { cn, randomUUID } from "~/lib/utils";
import { ensureLocalApi } from "~/localApi";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Input } from "../ui/input";
import { Menu, MenuPopup, MenuTrigger } from "../ui/menu";
import { ScrollArea } from "../ui/scroll-area";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
  selectTriggerVariants,
} from "../ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { BackgroundControls, RangeControl } from "./BackgroundControls";
import {
  BackgroundImagePicker,
  BackgroundThumbnail,
  backgroundPickerDeleteButtonClass,
  backgroundPickerMenuGridClass,
  backgroundPickerTileClass,
  backgroundStudioFieldClass,
} from "./BackgroundImagePicker";

const FILTER_LABELS: Readonly<Record<CustomBackgroundFilterKind, string>> = {
  none: "No filter",
  "image-dithering": "Dithering",
  "fluted-glass": "Fluted glass",
  "lens-distortion": "Lens distortion",
  "static-mesh-gradient": "Mesh gradient",
  "grain-gradient": "Grain gradient",
};

function isFilterKind(value: unknown): value is CustomBackgroundFilterKind {
  return typeof value === "string" && Object.hasOwn(FILTER_LABELS, value);
}

const PERSIST_DEBOUNCE_MS = 150;

function describeUploadFailure(reason: string): string {
  switch (reason) {
    case "too-large":
      return "This image is too large to store. Choose a smaller one.";
    case "quota":
      return "This browser is out of storage for images. Delete unused images and try again.";
    case "unavailable":
      return "Image storage is unavailable in this browser context.";
    default:
      return "Could not read this image.";
  }
}

function NameField({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  const commit = () => {
    const trimmed = draft.trim().slice(0, CUSTOM_BACKGROUND_NAME_MAX_LENGTH);
    if (trimmed.length === 0) {
      setDraft(name);
      return;
    }
    if (trimmed !== name) onCommit(trimmed);
  };
  return (
    <Input
      aria-label="Background name"
      size="sm"
      unstyled
      className={backgroundStudioFieldClass(
        "[&_[data-slot=input]]:h-full sm:[&_[data-slot=input]]:h-full",
      )}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function libraryPreview(record: CustomBackgroundRecord | null): {
  name: string;
  filter: string;
} {
  if (record === null) return { name: "None", filter: "Plain theme" };
  return { name: record.name, filter: FILTER_LABELS[record.filter.kind] };
}

function LibraryThumb({
  record,
  className,
}: {
  record: CustomBackgroundRecord | null;
  className: string;
}) {
  const imageId = record?.source.kind === "image" ? record.source.imageId : null;
  const generative = record ? isGenerativeCustomBackgroundFilter(record.filter.kind) : false;
  if (record === null) {
    return (
      <span
        className={cn(
          "flex items-center justify-center border border-dashed border-border bg-muted/40 text-muted-foreground",
          className,
        )}
      >
        <BanIcon className="size-4" />
      </span>
    );
  }
  if (generative) {
    return (
      <span
        className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}
      >
        <SparklesIcon className="size-4" />
      </span>
    );
  }
  return <BackgroundThumbnail imageId={imageId} className={className} />;
}

function LibraryTile({
  record,
  selected,
  onSelect,
  onDelete,
}: {
  record: CustomBackgroundRecord | null;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  const { name, filter } = libraryPreview(record);
  return (
    <div className="group relative min-w-0">
      <button
        type="button"
        aria-label={`${name}, ${filter}`}
        aria-pressed={selected}
        onClick={onSelect}
        className={backgroundPickerTileClass(selected)}
      >
        <LibraryThumb record={record} className="aspect-[4/3] w-full" />
        <span className="block space-y-0.5 px-1.5 py-1.5">
          <span className="block truncate text-xs text-foreground">{name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{filter}</span>
        </span>
      </button>
      {onDelete ? (
        <Button
          size="icon-xs"
          variant="outline"
          className={backgroundPickerDeleteButtonClass}
          aria-label={`Delete background ${name}`}
          onClick={onDelete}
        >
          <Trash2Icon />
        </Button>
      ) : null}
    </div>
  );
}

function LibraryPicker({
  library,
  selectedId,
  selectedRecord,
  onSelect,
  onDelete,
}: {
  library: CustomBackgroundLibrary;
  selectedId: string | null;
  selectedRecord: CustomBackgroundRecord | null;
  onSelect: (id: string | null) => void;
  onDelete: (record: CustomBackgroundRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const { name, filter } = libraryPreview(selectedRecord);
  const pick = (id: string | null) => {
    onSelect(id);
    setOpen(false);
  };
  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger
        render={
          <button
            type="button"
            aria-label={`Background: ${name}, ${filter}`}
            className={cn(
              selectTriggerVariants({ size: "default" }),
              "h-auto w-full items-center py-1.5",
            )}
          >
            <LibraryThumb record={selectedRecord} className="size-8 shrink-0 rounded-md" />
            <span className="min-w-0 flex-1 text-left leading-tight">
              <span className="block truncate text-sm font-medium text-foreground">{name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{filter}</span>
            </span>
            <ChevronsUpDownIcon className="-me-1 size-4 opacity-80" />
          </button>
        }
      />
      <MenuPopup align="start" className="w-(--anchor-width) min-w-80">
        <div className={cn(backgroundPickerMenuGridClass, "gap-2.5")}>
          <LibraryTile
            record={null}
            selected={selectedRecord === null}
            onSelect={() => pick(null)}
          />
          {library.map((entry) => {
            const tileRecord =
              selectedRecord && entry.id === selectedRecord.id ? selectedRecord : entry;
            return (
              <LibraryTile
                key={entry.id}
                record={tileRecord}
                selected={entry.id === selectedId}
                onSelect={() => pick(entry.id)}
                onDelete={() => onDelete(tileRecord)}
              />
            );
          })}
        </div>
      </MenuPopup>
    </Menu>
  );
}

export function BackgroundStudioPanel({ onClose }: { onClose: () => void }) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const dragOffset = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    mounted.current = true;
    const resetPosition = () => setPosition(null);
    window.addEventListener("resize", resetPosition);
    return () => {
      mounted.current = false;
      window.removeEventListener("resize", resetPosition);
    };
  }, []);
  const library = useClientSettings((settings) => settings.customBackgrounds);
  const activeId = useClientSettings((settings) => settings.activeCustomBackgroundId);
  const inConversations = useClientSettings((settings) => settings.customBackgroundInConversations);
  const enabled = useClientSettings((settings) => settings.customBackgroundEnabled);
  const updateSettings = useUpdateClientSettings();

  const selectedId = activeId;
  const liveRecord = useBackgroundStudioStore((store) => store.preview);
  const setLiveRecord = useBackgroundStudioStore((store) => store.setPreview);
  const [upload, setUpload] = useState<{
    busy: boolean;
    error: string | null;
  }>({
    busy: false,
    error: null,
  });
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Flush the latest edit on unmount without waiting for a React update.
  const pendingRef = useRef<CustomBackgroundRecord | null>(null);

  const storedRecord = useMemo(
    () => (selectedId === null ? null : (library.find((r) => r.id === selectedId) ?? null)),
    [library, selectedId],
  );
  const record = liveRecord && liveRecord.id === selectedId ? liveRecord : storedRecord;
  const persistLibrary = useCallback(
    (next: CustomBackgroundLibrary, nextActiveId?: string | null) => {
      updateSettings(
        nextActiveId === undefined
          ? { customBackgrounds: next }
          : {
              customBackgrounds: next,
              activeCustomBackgroundId: nextActiveId,
            },
      );
    },
    [updateSettings],
  );

  const flushPending = useCallback(() => {
    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) {
      persistLibrary(upsertBackground(getClientSettings().customBackgrounds, pending));
    }
    setLiveRecord(null);
  }, [persistLibrary, setLiveRecord]);

  const commitRecord = useCallback(
    (next: CustomBackgroundRecord) => {
      pendingRef.current = next;
      setLiveRecord(next);
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(flushPending, PERSIST_DEBOUNCE_MS);
    },
    [flushPending, setLiveRecord],
  );

  useEffect(() => flushPending, [flushPending]);

  const selectRow = (id: string | null) => {
    flushPending();
    if (id !== activeId) updateSettings({ activeCustomBackgroundId: id });
  };

  const addRecord = (next: CustomBackgroundRecord) => {
    flushPending();
    persistLibrary(upsertBackground(getClientSettings().customBackgrounds, next), next.id);
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    setUpload({ busy: true, error: null });
    const result = await storeBackgroundImage(file);
    if (!mounted.current) return null;
    if (!result.ok) {
      setUpload({
        busy: false,
        error: describeUploadFailure(result.reason),
      });
      return null;
    }
    setUpload({ busy: false, error: null });
    return result.image.id;
  };

  const createBackground = () => {
    addRecord(
      createGenerativeBackground({
        id: randomUUID(),
        name: nextNewBackgroundName(getClientSettings().customBackgrounds),
        filter: defaultCustomBackgroundFilter("none"),
        createdAt: new Date().toISOString(),
      }),
    );
  };

  const deleteBackground = async (record: CustomBackgroundRecord) => {
    const confirmed = await ensureLocalApi().dialogs.confirm(
      `Delete background "${record.name}"?\nIts image stays available to other backgrounds.`,
      { variant: "destructive" },
    );
    if (!confirmed || !mounted.current) return;
    flushPending();
    const current = getClientSettings();
    persistLibrary(
      removeBackground(current.customBackgrounds, record.id),
      nextActiveAfterRemove(current.activeCustomBackgroundId, record.id),
    );
  };

  const referencedImageIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of library) {
      if (entry.source.kind === "image") ids.add(entry.source.imageId);
    }
    return ids;
  }, [library]);

  const filterIsDefault =
    record !== null &&
    filtersEqual(record.filter, defaultCustomBackgroundFilter(record.filter.kind));

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Customize background"
      className={cn(
        "dialog-glass fixed z-40 flex max-h-[calc(100dvh-2rem)] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border text-popover-foreground",
        position === null && "bottom-4 right-4",
        !isMinimized && "h-[min(42rem,calc(100dvh-2rem))]",
      )}
      style={
        position
          ? {
              left: position.x,
              top: position.y,
              maxHeight: `calc(100dvh - ${position.y + 16}px)`,
            }
          : undefined
      }
    >
      <div
        className="flex shrink-0 cursor-grab touch-none select-none items-center gap-1 border-b border-border/70 px-3 py-2 active:cursor-grabbing"
        onPointerDown={(event) => {
          if (
            event.button !== 0 ||
            (event.target instanceof Element && event.target.closest("button"))
          )
            return;
          const rect = panelRef.current?.getBoundingClientRect();
          if (!rect) return;
          dragOffset.current = {
            x: event.clientX - rect.x,
            y: event.clientY - rect.y,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const offset = dragOffset.current;
          if (!offset) return;
          setPosition({
            x: Math.max(
              8,
              Math.min(
                event.clientX - offset.x,
                window.innerWidth - (panelRef.current?.offsetWidth ?? 0) - 8,
              ),
            ),
            y: Math.max(8, Math.min(event.clientY - offset.y, window.innerHeight - 100)),
          });
        }}
        onPointerUp={() => {
          dragOffset.current = null;
        }}
        onPointerCancel={() => {
          dragOffset.current = null;
        }}
      >
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">Customize background</h2>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={isMinimized ? "Expand background controls" : "Minimize background controls"}
          onClick={() => setIsMinimized(!isMinimized)}
        >
          {isMinimized ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Close background controls"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col", isMinimized && "hidden")}>
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                Enable custom background
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) =>
                    updateSettings({ customBackgroundEnabled: checked })
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                Show in threads
                <Switch
                  checked={inConversations}
                  disabled={!enabled}
                  onCheckedChange={(checked) =>
                    updateSettings({ customBackgroundInConversations: checked })
                  }
                />
              </label>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-foreground">Background</span>
              <Button
                size="xs"
                variant="outline"
                aria-label="Add background"
                onClick={createBackground}
              >
                <PlusIcon /> New background
              </Button>
            </div>
            <LibraryPicker
              library={library}
              selectedId={selectedId}
              selectedRecord={record}
              onSelect={selectRow}
              onDelete={(entry) => void deleteBackground(entry)}
            />

            {record ? (
              <ScrollArea className="min-h-0 flex-1" scrollFade>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-[13px] text-muted-foreground">Name</span>
                    <NameField
                      key={record.id}
                      name={record.name}
                      onCommit={(name) =>
                        commitRecord({
                          ...record,
                          name,
                        })
                      }
                    />
                  </div>
                  {!isGenerativeCustomBackgroundFilter(record.filter.kind) ? (
                    <BackgroundImagePicker
                      selectedImageId={
                        record.source.kind === "image" ? record.source.imageId : null
                      }
                      referencedImageIds={referencedImageIds}
                      busy={upload.busy}
                      onSelect={(imageId) =>
                        commitRecord({
                          ...record,
                          source: {
                            kind: "image",
                            imageId,
                          },
                        })
                      }
                      onUpload={(file) => {
                        void uploadImage(file).then((imageId) => {
                          if (imageId) {
                            flushPending();
                            const current = getClientSettings().customBackgrounds;
                            // Update only the image on a surviving record. Edits made
                            // during encoding, including edits to another selection, win.
                            persistLibrary(
                              current.map((entry) =>
                                entry.id === record.id &&
                                entry.source.kind === record.source.kind &&
                                (entry.source.kind !== "image" ||
                                  (record.source.kind === "image" &&
                                    entry.source.imageId === record.source.imageId))
                                  ? { ...entry, source: { kind: "image", imageId } }
                                  : entry,
                              ),
                            );
                          }
                        });
                      }}
                    />
                  ) : null}

                  <h3 className="text-[13px] font-medium">Filter</h3>
                  <div className="shrink-0">
                    <div className="flex items-center gap-3">
                      <span className="w-28 shrink-0 text-[13px] text-muted-foreground">
                        Filter
                      </span>
                      <Select
                        value={record.filter.kind}
                        onValueChange={(kind) => {
                          if (isFilterKind(kind)) commitRecord(withFilterKind(record, kind));
                        }}
                      >
                        <SelectTrigger
                          size="sm"
                          className="min-h-0 h-7.5 min-w-0 flex-1 sm:h-6.5 sm:min-h-0"
                          aria-label="Filter"
                        >
                          <SelectValue>{FILTER_LABELS[record.filter.kind]}</SelectValue>
                        </SelectTrigger>
                        <SelectPopup align="end" alignItemWithTrigger={false}>
                          <SelectItem hideIndicator value="none">
                            {FILTER_LABELS.none}
                          </SelectItem>
                          {CUSTOM_BACKGROUND_IMAGE_FILTERS.map(({ kind }) => (
                            <SelectItem key={kind} hideIndicator value={kind}>
                              {FILTER_LABELS[kind]}
                            </SelectItem>
                          ))}
                          {CUSTOM_BACKGROUND_GENERATIVE_FILTERS.map(({ kind }) => (
                            <SelectItem key={kind} hideIndicator value={kind}>
                              {FILTER_LABELS[kind]}
                            </SelectItem>
                          ))}
                        </SelectPopup>
                      </Select>
                      {!filterIsDefault && record.filter.kind !== "none" ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                size="icon-sm"
                                variant="ghost-muted"
                                aria-label="Reset filter to defaults"
                                onClick={() =>
                                  commitRecord({
                                    ...record,
                                    filter: defaultCustomBackgroundFilter(record.filter.kind),
                                  })
                                }
                              >
                                <Undo2Icon />
                              </Button>
                            }
                          />
                          <TooltipPopup side="top">Reset filter to defaults</TooltipPopup>
                        </Tooltip>
                      ) : null}
                    </div>
                  </div>

                  {upload.error ? (
                    <p role="alert" className="pl-[calc(7rem+0.75rem)] text-xs text-destructive">
                      {upload.error}
                    </p>
                  ) : null}

                  <RangeControl
                    label="Fade"
                    min={MIN_CUSTOM_BACKGROUND_FADE}
                    max={MAX_CUSTOM_BACKGROUND_FADE}
                    step={5}
                    value={record.fade}
                    format={(value) => `${Math.round(value)}%`}
                    onChange={(fade) =>
                      commitRecord({
                        ...record,
                        fade: Math.round(fade),
                      })
                    }
                  />

                  <BackgroundControls
                    filter={record.filter}
                    onChange={(filter) =>
                      commitRecord({
                        ...record,
                        filter,
                      })
                    }
                  />
                </div>
              </ScrollArea>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border/60 p-6 text-center text-[13px] text-muted-foreground">
                Add a background to get started, or pick one to edit.
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 justify-end border-t border-border/70 px-3 py-2">
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
