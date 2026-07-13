import {
  type ProviderInstanceId,
  type ProviderDriverKind,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import { resolveSelectableModel } from "@t3tools/shared/model";
import { LegendList, type LegendListRef } from "@legendapp/list/react";
import {
  memo,
  useMemo,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { SearchIcon } from "lucide-react";
import { ModelListRow } from "./ModelListRow";
import {
  MODEL_PICKER_CUSTOM_GROUP_ID,
  ModelPickerSidebar,
  type ModelPickerSelection,
} from "./ModelPickerSidebar";
import { isModelPickerNewModel } from "./modelPickerModelHighlights";
import { buildModelPickerSearchText, scoreModelPickerSearch } from "./modelPickerSearch";
import { Combobox, ComboboxEmpty, ComboboxInput, ComboboxListVirtualized } from "../ui/combobox";
import { ModelEsque } from "./providerIconUtils";
import {
  modelPickerJumpCommandForIndex,
  modelPickerJumpIndexFromCommand,
  resolveShortcutCommand,
  shortcutLabelForCommand,
} from "../../keybindings";
import { useClientSettings, useUpdateClientSettings } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import { TooltipProvider } from "../ui/tooltip";
import {
  isProviderInstancePickerReady,
  isProviderInstancePickerVisible,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { providerModelKey, sortProviderModelItems } from "../../modelOrdering";
import { Dithering } from "@paper-design/shaders-react";
import { Slider } from "../ui/slider";

type DitheringType = "random" | "2x2" | "4x4" | "8x8";

type CustomModelLayer = {
  colorFront: string;
  rotation: number;
};

type CustomModelPickerConfig = {
  name: string;
  type: DitheringType;
  size: number;
  scale: number;
  layers: ReadonlyArray<CustomModelLayer>;
};

type ThinkingStepDirection = "increase" | "decrease";

type ModelPickerItem = {
  slug: string;
  name: string;
  shortName?: string;
  subProvider?: string;
  instanceId: ProviderInstanceId;
  driverKind: ProviderDriverKind;
  instanceDisplayName: string;
  instanceAccentColor?: string | undefined;
  continuationGroupKey?: string | undefined;
};

const EMPTY_MODEL_JUMP_LABELS = new Map<string, string>();

const THINKING_LEVELS = ["Low", "Medium", "High", "Extra High", "Max", "Ultra"] as const;
const MAX_THINKING_STEP = THINKING_LEVELS.length - 1;
const MIN_DITHERING_SIZE = 0.5;
const DITHERING_SIZE_MULTIPLIERS = [3, 2.4, 1.9, 1.5, 1, 0.8] as const;

const CUSTOM_MODEL_PICKERS = [
  {
    name: "GPT-5.6-Luna",
    type: "8x8",
    size: 2,
    scale: 0.3,
    layers: [
      { colorFront: "#b5b5b5", rotation: 180 },
      { colorFront: "#ffffff", rotation: 0 },
    ],
  },
  {
    name: "GPT-5.6-Terra",
    type: "4x4",
    size: 2,
    scale: 0.6,
    layers: [
      { colorFront: "#15ff00", rotation: 70 },
      { colorFront: "#0048ff", rotation: 0 },
    ],
  },
  {
    name: "GPT-5.6-Sol",
    type: "4x4",
    size: 2,
    scale: 0.9,
    layers: [
      { colorFront: "#ff8800", rotation: 0 },
      { colorFront: "#ff6200", rotation: 270 },
    ],
  },
] as const satisfies ReadonlyArray<CustomModelPickerConfig>;

/**
 * Dithering's size is a pixel size, so smaller values produce more detail.
 * Each model's configured size is the current quality at Max. Low starts at
 * a coarser grid for a clearer contrast, while Ultra gets a small final bump.
 */
function ditheringSizeForStep(baseSize: number, step: number) {
  const qualityStep = Math.min(Math.max(Math.round(step), 0), MAX_THINKING_STEP);
  const sizeMultiplier = DITHERING_SIZE_MULTIPLIERS[qualityStep] ?? 1;
  return Math.max(MIN_DITHERING_SIZE, baseSize * sizeMultiplier);
}

function CustomModelPicker({
  name,
  type,
  size,
  scale,
  layers,
}: {
  name: string;
  type: DitheringType;
  size: number;
  scale: number;
  layers: ReadonlyArray<CustomModelLayer>;
}) {
  const [thinkingStep, setThinkingStep] = useState(0);
  const [thinkingDirection, setThinkingDirection] = useState<ThinkingStepDirection | null>(null);
  const previousThinkingStepRef = useRef(thinkingStep);
  const ditheringSize = ditheringSizeForStep(size, thinkingStep);
  const thinkingLabel = THINKING_LEVELS[thinkingStep] ?? THINKING_LEVELS[0];

  return (
    <div className="relative flex w-full flex-row items-center overflow-hidden rounded-lg border border-border">
      {/*<DotOrbit
                className="pointer-events-none z-1 absolute inset-0 size-full rounded-lg"
                colors={["#ffffff"]}
                colorBack="#000000"
                stepsPerColor={4}
                size={0.3}
                sizeRange={0.2}
                spreading={1}
                speed={0.1}
                scale={0.25}
            />*/}
      <div className="relative size-[100px] z-2 shrink-0 overflow-hidden rounded-lg">
        {layers.map((layer, index) => (
          <Dithering
            key={`${layer.colorFront}-${layer.rotation}`}
            className="pointer-events-none absolute inset-0 size-full rounded-lg"
            colorBack="#ffffff00"
            colorFront={layer.colorFront}
            shape="sphere"
            rotation={layer.rotation}
            type={type}
            size={ditheringSize}
            speed={1}
            scale={scale}
            style={{ zIndex: index }}
          />
        ))}
      </div>

      <div className="flex-1 pr-4">
        <p className="text-foreground text-xs font-medium">{name}</p>
        <p
          className="h-4 overflow-hidden text-xs leading-4 text-muted-foreground"
          aria-live="polite"
          aria-atomic="true"
        >
          <span
            key={thinkingStep}
            className={cn(
              "block",
              thinkingDirection === "increase" && "thinking-step-label-increase",
              thinkingDirection === "decrease" && "thinking-step-label-decrease",
            )}
          >
            {thinkingLabel}
          </span>
        </p>
        <Slider
          className="mt-1 border rounded-lg border-border"
          aria-label={`${name} thinking quality`}
          value={[thinkingStep]}
          onValueChange={(value) => {
            const nextValue = Array.isArray(value) ? value[0] : value;
            const nextStep = Math.min(Math.max(Math.round(nextValue ?? 0), 0), MAX_THINKING_STEP);
            const previousStep = previousThinkingStepRef.current;
            if (nextStep === previousStep) {
              return;
            }
            setThinkingDirection(nextStep > previousStep ? "increase" : "decrease");
            previousThinkingStepRef.current = nextStep;
            setThinkingStep(nextStep);
          }}
          min={0}
          max={MAX_THINKING_STEP}
          step={1}
        />
      </div>
    </div>
  );
}

function CustomModelPickerEmptyState() {
  return (
    <div className="flex flex-col gap-2 p-2 w-full">
      {CUSTOM_MODEL_PICKERS.map((model) => (
        <CustomModelPicker key={model.name} {...model} />
      ))}
    </div>
  );
}

// Split a `${instanceId}:${slug}` combobox key back into its pieces. Slugs
// can contain colons (e.g. some vendor model ids), so we only split on the
// first colon — anything after that is the slug.
function splitInstanceModelKey(key: string): {
  instanceId: ProviderInstanceId;
  slug: string;
} {
  const colonIndex = key.indexOf(":");
  if (colonIndex === -1) {
    return { instanceId: key as ProviderInstanceId, slug: "" };
  }
  return {
    instanceId: key.slice(0, colonIndex) as ProviderInstanceId,
    slug: key.slice(colonIndex + 1),
  };
}

export const ModelPickerContent = memo(function ModelPickerContent(props: {
  /** The instance currently selected in the composer (combobox "value"). */
  activeInstanceId: ProviderInstanceId;
  model: string;
  /**
   * When set, the picker is locked to the given driver kind — typically
   * because the user is editing a previously-sent message and can't change
   * which driver served the turn. Multiple instances of the same kind
   * remain selectable (e.g. locked to `codex` still lets the user switch
   * between the default Codex and a custom Codex Personal).
   */
  lockedProvider: ProviderDriverKind | null;
  lockedContinuationGroupKey?: string | null;
  /**
   * All configured provider instances in display order. Used to render
   * the sidebar (one button per instance) and to resolve display names
   * for the locked-mode header.
   */
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  keybindings?: ResolvedKeybindingsConfig;
  /**
   * Model options per instance. Keyed by `ProviderInstanceId` so the
   * default Codex instance and any custom Codex instances each have their
   * own list (custom instances typically start with the same built-in
   * model set but are free to diverge via customModels).
   */
  modelOptionsByInstance: ReadonlyMap<ProviderInstanceId, ReadonlyArray<ModelEsque>>;
  /** Custom JSX rendered by the hardcoded custom group in the picker sidebar. */
  customGroupContent?: ReactNode;
  terminalOpen: boolean;
  onRequestClose?: () => void;
  getModelDisabledReason?: (instanceId: ProviderInstanceId, model: string) => string | null;
  onInstanceModelChange: (instanceId: ProviderInstanceId, model: string) => void;
}) {
  const {
    keybindings: providedKeybindings,
    modelOptionsByInstance,
    instanceEntries,
    getModelDisabledReason,
    onInstanceModelChange,
  } = props;
  const [searchQuery, setSearchQuery] = useState("");
  const [showTopScrollFade, setShowTopScrollFade] = useState(false);
  const [showBottomScrollFade, setShowBottomScrollFade] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const modelListRef = useRef<LegendListRef | null>(null);
  const highlightedModelKeyRef = useRef<string | null>(null);
  const favorites = useClientSettings((s) => s.favorites ?? []);
  const [selectedInstanceId, setSelectedInstanceId] = useState<ModelPickerSelection>(() => {
    if (props.lockedProvider !== null) {
      // When locked, prime the sidebar to the currently-active instance
      // so jumping into the picker keeps the focused instance visible.
      return props.activeInstanceId;
    }
    return favorites.length > 0 ? "favorites" : props.activeInstanceId;
  });
  const keybindings = useMemo<ResolvedKeybindingsConfig>(
    () => providedKeybindings ?? [],
    [providedKeybindings],
  );
  const updateSettings = useUpdateClientSettings();

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus({ preventScroll: true });
  }, []);

  const handleSelectInstance = useCallback(
    (instanceId: ModelPickerSelection) => {
      setSelectedInstanceId(instanceId);
      if (instanceId === MODEL_PICKER_CUSTOM_GROUP_ID) {
        setSearchQuery("");
      }
      window.requestAnimationFrame(() => {
        focusSearchInput();
      });
    },
    [focusSearchInput],
  );

  useLayoutEffect(() => {
    focusSearchInput();
    const frame = window.requestAnimationFrame(() => {
      focusSearchInput();
    });
    const timeout = window.setTimeout(() => {
      focusSearchInput();
    }, 0);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [focusSearchInput]);

  // Create a Set for efficient lookup. Favorites are keyed by
  // `${instanceId}:${slug}`; the storage schema widened from ProviderDriverKind
  // to ProviderInstanceId so pre-migration favorites keyed by driver slugs
  // (e.g. `"codex:gpt-5"`) still resolve — the default instance id equals
  // the driver slug.
  const favoritesSet = useMemo(() => {
    return new Set(favorites.map((fav) => providerModelKey(fav.provider, fav.model)));
  }, [favorites]);

  /**
   * Lookup table keyed by `instanceId`. Used for display name + driver
   * kind enrichment and for `ready`/enabled filtering before flattening
   * models into the search list.
   */
  const entryByInstanceId = useMemo(
    () => new Map(instanceEntries.map((entry) => [entry.instanceId, entry])),
    [instanceEntries],
  );
  const matchesLockedProvider = useCallback(
    (entry: Pick<ProviderInstanceEntry, "driverKind" | "continuationGroupKey">): boolean => {
      if (props.lockedProvider === null) return true;
      if (entry.driverKind !== props.lockedProvider) return false;
      if (!props.lockedContinuationGroupKey) return true;
      return entry.continuationGroupKey === props.lockedContinuationGroupKey;
    },
    [props.lockedContinuationGroupKey, props.lockedProvider],
  );

  const readyInstanceSet = useMemo(() => {
    const ready = new Set<ProviderInstanceId>();
    for (const entry of instanceEntries) {
      if (isProviderInstancePickerReady(entry)) {
        ready.add(entry.instanceId);
      }
    }
    return ready;
  }, [instanceEntries]);

  // Flatten models into a searchable array. One pass over the
  // instance-keyed map; each model carries its instance id + driver kind
  // so the list row can render the right icon and display name without
  // another lookup.
  const flatModels = useMemo(() => {
    const out: ModelPickerItem[] = [];
    for (const [instanceId, models] of modelOptionsByInstance) {
      const entry = entryByInstanceId.get(instanceId);
      if (!entry) {
        // Instance disappeared between renders (configuration change). Skip
        // its models — stale options shouldn't appear in the picker.
        continue;
      }
      if (!readyInstanceSet.has(instanceId)) {
        continue;
      }
      for (const model of models) {
        out.push({
          slug: model.slug,
          name: model.name,
          ...(model.shortName ? { shortName: model.shortName } : {}),
          ...(model.subProvider ? { subProvider: model.subProvider } : {}),
          instanceId,
          driverKind: entry.driverKind,
          instanceDisplayName: entry.displayName,
          ...(entry.accentColor ? { instanceAccentColor: entry.accentColor } : {}),
          ...(entry.continuationGroupKey
            ? { continuationGroupKey: entry.continuationGroupKey }
            : {}),
        });
      }
    }
    return out;
  }, [modelOptionsByInstance, entryByInstanceId, readyInstanceSet]);

  const isLocked = props.lockedProvider !== null;
  const isSearching = searchQuery.trim().length > 0;
  const lockedDisabledInstanceIds = useMemo(() => {
    if (!isLocked) {
      return undefined;
    }
    const disabled = new Set<ProviderInstanceId>();
    for (const entry of instanceEntries) {
      if (!matchesLockedProvider(entry)) {
        disabled.add(entry.instanceId);
      }
    }
    return disabled;
  }, [instanceEntries, isLocked, matchesLockedProvider]);
  const sidebarInstanceEntries = useMemo(() => {
    const enabledEntries = instanceEntries.filter(isProviderInstancePickerVisible);
    if (!isLocked) {
      return enabledEntries;
    }
    const available: ProviderInstanceEntry[] = [];
    const disabled: ProviderInstanceEntry[] = [];
    for (const entry of enabledEntries) {
      if (matchesLockedProvider(entry)) {
        available.push(entry);
      } else {
        disabled.push(entry);
      }
    }
    return [...available, ...disabled];
  }, [instanceEntries, isLocked, matchesLockedProvider]);
  const showSidebar = !isSearching && sidebarInstanceEntries.length > 0;
  const instanceOrder = useMemo(
    () => instanceEntries.map((entry) => entry.instanceId),
    [instanceEntries],
  );

  // Filter models based on search query and selected instance
  const filteredModels = useMemo(() => {
    if (selectedInstanceId === MODEL_PICKER_CUSTOM_GROUP_ID) {
      return [];
    }

    let result = flatModels;

    // Apply tokenized fuzzy search across the combined provider/model search fields.
    if (searchQuery.trim()) {
      const rankedMatches = result
        .map((model) => ({
          model,
          score: scoreModelPickerSearch(
            {
              name: model.name,
              ...(model.shortName ? { shortName: model.shortName } : {}),
              ...(model.subProvider ? { subProvider: model.subProvider } : {}),
              driverKind: model.driverKind,
              providerDisplayName: model.instanceDisplayName,
              isFavorite: favoritesSet.has(providerModelKey(model.instanceId, model.slug)),
            },
            searchQuery,
          ),
          isFavorite: favoritesSet.has(providerModelKey(model.instanceId, model.slug)),
          tieBreaker: buildModelPickerSearchText({
            name: model.name,
            ...(model.shortName ? { shortName: model.shortName } : {}),
            ...(model.subProvider ? { subProvider: model.subProvider } : {}),
            driverKind: model.driverKind,
            providerDisplayName: model.instanceDisplayName,
          }),
        }))
        .filter(
          (
            rankedModel,
          ): rankedModel is {
            model: ModelPickerItem;
            score: number;
            isFavorite: boolean;
            tieBreaker: string;
          } => rankedModel.score !== null,
        );

      // When searching, we only respect locked provider (by driver kind),
      // ignoring sidebar selection so account-scoped searches can find a
      // model before the user chooses a specific instance rail item.
      if (props.lockedProvider !== null) {
        const lockedProviderMatches: Array<(typeof rankedMatches)[number]> = [];
        for (const rankedModel of rankedMatches) {
          if (matchesLockedProvider(rankedModel.model)) {
            lockedProviderMatches.push(rankedModel);
          }
        }
        return lockedProviderMatches
          .toSorted((a, b) => {
            const scoreDelta = a.score - b.score;
            if (scoreDelta !== 0) {
              return scoreDelta;
            }
            if (a.isFavorite !== b.isFavorite) {
              return a.isFavorite ? -1 : 1;
            }
            return a.tieBreaker.localeCompare(b.tieBreaker);
          })
          .map((rankedModel) => rankedModel.model);
      }

      return rankedMatches
        .toSorted((a, b) => {
          const scoreDelta = a.score - b.score;
          if (scoreDelta !== 0) {
            return scoreDelta;
          }
          if (a.isFavorite !== b.isFavorite) {
            return a.isFavorite ? -1 : 1;
          }
          return a.tieBreaker.localeCompare(b.tieBreaker);
        })
        .map((rankedModel) => rankedModel.model);
    }

    if (props.lockedProvider !== null) {
      result = result.filter((m) => matchesLockedProvider(m));
      if (selectedInstanceId === "favorites") {
        result = result.filter((m) => favoritesSet.has(providerModelKey(m.instanceId, m.slug)));
      } else {
        result = result.filter((m) => m.instanceId === selectedInstanceId);
      }
    } else if (selectedInstanceId === "favorites") {
      result = result.filter((m) => favoritesSet.has(providerModelKey(m.instanceId, m.slug)));
    } else {
      result = result.filter((m) => m.instanceId === selectedInstanceId);
    }

    return sortProviderModelItems(result, {
      favoriteModelKeys: favoritesSet,
      groupFavorites: selectedInstanceId !== "favorites",
      instanceOrder: selectedInstanceId === "favorites" ? instanceOrder : [],
    });
  }, [
    favoritesSet,
    flatModels,
    instanceOrder,
    matchesLockedProvider,
    props.lockedProvider,
    searchQuery,
    selectedInstanceId,
  ]);

  const isCustomGroup = selectedInstanceId === MODEL_PICKER_CUSTOM_GROUP_ID;
  const customGroupContent =
    props.customGroupContent === undefined ? (
      <CustomModelPickerEmptyState />
    ) : (
      props.customGroupContent
    );

  const handleModelSelect = useCallback(
    (modelSlug: string, instanceId: ProviderInstanceId) => {
      if (getModelDisabledReason?.(instanceId, modelSlug)) {
        return;
      }
      const options = modelOptionsByInstance.get(instanceId);
      if (!options) {
        return;
      }
      const entry = entryByInstanceId.get(instanceId);
      if (!entry) {
        return;
      }
      // `resolveSelectableModel` uses the driver kind for normalization
      // (slug casing etc.). Custom instances share their driver's
      // normalization rules, so pass the driver kind here.
      const resolvedModel = resolveSelectableModel(entry.driverKind, modelSlug, options);
      if (resolvedModel) {
        onInstanceModelChange(instanceId, resolvedModel);
      }
    },
    [entryByInstanceId, getModelDisabledReason, modelOptionsByInstance, onInstanceModelChange],
  );

  const toggleFavorite = useCallback(
    (instanceId: ProviderInstanceId, model: string) => {
      const newFavorites = [...favorites];
      const index = newFavorites.findIndex((f) => f.provider === instanceId && f.model === model);
      if (index >= 0) {
        newFavorites.splice(index, 1);
      } else {
        newFavorites.push({ provider: instanceId, model });
      }
      updateSettings({ favorites: newFavorites });
    },
    [favorites, updateSettings],
  );

  const modelJumpCommandByKey = useMemo(() => {
    const mapping = new Map<
      string,
      NonNullable<ReturnType<typeof modelPickerJumpCommandForIndex>>
    >();
    let selectableModelIndex = 0;
    for (const model of filteredModels) {
      if (getModelDisabledReason?.(model.instanceId, model.slug)) {
        continue;
      }
      const jumpCommand = modelPickerJumpCommandForIndex(selectableModelIndex);
      if (!jumpCommand) {
        return mapping;
      }
      mapping.set(`${model.instanceId}:${model.slug}`, jumpCommand);
      selectableModelIndex += 1;
    }
    return mapping;
  }, [filteredModels, getModelDisabledReason]);
  const modelJumpModelKeys = useMemo(
    () => [...modelJumpCommandByKey.keys()],
    [modelJumpCommandByKey],
  );
  const allModelKeys = useMemo(
    (): string[] => flatModels.map((model) => `${model.instanceId}:${model.slug}`),
    [flatModels],
  );
  const filteredModelKeys = useMemo(
    (): string[] => filteredModels.map((model) => `${model.instanceId}:${model.slug}`),
    [filteredModels],
  );
  const filteredModelByKey = useMemo(
    (): ReadonlyMap<string, ModelPickerItem> =>
      new Map(filteredModels.map((model) => [`${model.instanceId}:${model.slug}`, model] as const)),
    [filteredModels],
  );
  const updateModelListScrollFades = useCallback(() => {
    const scrollElement = modelListRef.current?.getScrollableNode();
    if (!(scrollElement instanceof HTMLElement)) {
      return;
    }
    const maxScrollOffset = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
    setShowTopScrollFade(scrollElement.scrollTop > 1);
    setShowBottomScrollFade(maxScrollOffset - scrollElement.scrollTop > 1);
  }, []);
  const modelJumpShortcutContext = useMemo(
    () =>
      ({
        terminalFocus: false,
        terminalOpen: props.terminalOpen,
        modelPickerOpen: true,
      }) as const,
    [props.terminalOpen],
  );
  const modelJumpLabelByKey = useMemo((): ReadonlyMap<string, string> => {
    if (modelJumpCommandByKey.size === 0) {
      return EMPTY_MODEL_JUMP_LABELS;
    }
    const shortcutLabelOptions = {
      platform: navigator.platform,
      context: modelJumpShortcutContext,
    };
    const mapping = new Map<string, string>();
    for (const [modelKey, command] of modelJumpCommandByKey) {
      const label = shortcutLabelForCommand(keybindings, command, shortcutLabelOptions);
      if (label) {
        mapping.set(modelKey, label);
      }
    }
    return mapping.size > 0 ? mapping : EMPTY_MODEL_JUMP_LABELS;
  }, [keybindings, modelJumpCommandByKey, modelJumpShortcutContext]);

  useEffect(() => {
    const onWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) {
        return;
      }

      const command = resolveShortcutCommand(event, keybindings, {
        platform: navigator.platform,
        context: modelJumpShortcutContext,
      });
      const jumpIndex = modelPickerJumpIndexFromCommand(command ?? "");
      if (jumpIndex === null) {
        return;
      }

      const targetModelKey = modelJumpModelKeys[jumpIndex];
      if (!targetModelKey) {
        return;
      }
      const { instanceId, slug } = splitInstanceModelKey(targetModelKey);
      event.preventDefault();
      event.stopPropagation();
      handleModelSelect(slug, instanceId);
    };

    window.addEventListener("keydown", onWindowKeyDown, true);

    return () => {
      window.removeEventListener("keydown", onWindowKeyDown, true);
    };
  }, [handleModelSelect, keybindings, modelJumpModelKeys, modelJumpShortcutContext]);

  useLayoutEffect(() => {
    setShowTopScrollFade(false);
    setShowBottomScrollFade(filteredModelKeys.length > 5);
    let nestedFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      updateModelListScrollFades();
      nestedFrame = window.requestAnimationFrame(updateModelListScrollFades);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(nestedFrame);
    };
  }, [filteredModelKeys, updateModelListScrollFades]);

  return (
    <TooltipProvider delay={0}>
      <div
        className="relative flex h-screen max-h-96 w-screen max-w-100 flex-row overflow-hidden rounded-lg border bg-popover not-dark:bg-clip-padding text-popover-foreground shadow-lg/5 before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] dark:before:shadow-[0_-1px_--theme(--color-white/6%)]"
        data-model-picker-content="true"
      >
        {/* Sidebar */}
        {showSidebar && (
          <ModelPickerSidebar
            selectedInstanceId={selectedInstanceId}
            onSelectInstance={handleSelectInstance}
            instanceEntries={sidebarInstanceEntries}
            showFavorites
            {...(lockedDisabledInstanceIds
              ? {
                  disabledInstanceIds: lockedDisabledInstanceIds,
                  getDisabledInstanceTooltip: (entry: ProviderInstanceEntry) =>
                    `${entry.displayName} is unavailable in this thread. Start a new thread to switch providers.`,
                }
              : {})}
          />
        )}

        {/* Main content area */}
        <Combobox
          inline
          items={allModelKeys}
          filteredItems={filteredModelKeys}
          filter={null}
          autoHighlight
          open
          virtualized
          value={`${props.activeInstanceId}:${props.model}`}
          onItemHighlighted={(modelKey, eventDetails) => {
            highlightedModelKeyRef.current = typeof modelKey === "string" ? modelKey : null;
            if (eventDetails.reason === "keyboard" && eventDetails.index >= 0) {
              void modelListRef.current?.scrollIndexIntoView?.({
                index: eventDetails.index,
                animated: false,
              });
            }
          }}
          onValueChange={(modelKey) => {
            if (typeof modelKey !== "string") {
              return;
            }
            const { instanceId, slug } = splitInstanceModelKey(modelKey);
            handleModelSelect(slug, instanceId);
          }}
        >
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/40",
              showSidebar && "border-l",
            )}
          >
            {/* Search bar */}
            <div className="px-4 pt-2.5">
              <div className="-translate-y-px border-b border-border/70 pb-2.5 transition-colors focus-within:border-ring">
                <ComboboxInput
                  ref={searchInputRef}
                  className="[&_input]:h-6.5 [&_input]:font-sans [&_input]:leading-6.5"
                  inputClassName="rounded-none bg-transparent text-sm"
                  placeholder="Search models..."
                  showTrigger={false}
                  startAddon={
                    <SearchIcon className="-translate-x-0.5 size-4 shrink-0 text-muted-foreground/55" />
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      props.onRequestClose?.();
                      return;
                    }
                    if (e.key === "Enter" && highlightedModelKeyRef.current) {
                      (
                        e as typeof e & {
                          preventBaseUIHandler?: () => void;
                        }
                      ).preventBaseUIHandler?.();
                      e.preventDefault();
                      e.stopPropagation();
                      const { instanceId, slug } = splitInstanceModelKey(
                        highlightedModelKeyRef.current,
                      );
                      handleModelSelect(slug, instanceId);
                      return;
                    }
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  size="sm"
                  unstyled
                />
              </div>
            </div>

            {/* Model list or custom group content */}
            <div className={cn("relative min-h-0 flex-1 overflow-hidden", isCustomGroup && "flex")}>
              {isCustomGroup ? (
                <div className="flex min-h-0 flex-1 overflow-y-auto">{customGroupContent}</div>
              ) : (
                <>
                  <ComboboxListVirtualized className="model-picker-list size-full min-w-0 p-0">
                    <LegendList<string>
                      ref={modelListRef}
                      data={filteredModelKeys}
                      extraData={favoritesSet}
                      keyExtractor={(modelKey) => modelKey}
                      renderItem={({ item: modelKey, index }) => {
                        const model = filteredModelByKey.get(modelKey);
                        if (!model) {
                          return null;
                        }
                        const disabledReason =
                          getModelDisabledReason?.(model.instanceId, model.slug) ?? null;
                        return (
                          <ModelListRow
                            key={modelKey}
                            index={index}
                            model={model}
                            instanceId={model.instanceId}
                            driverKind={model.driverKind}
                            providerDisplayName={model.instanceDisplayName}
                            providerAccentColor={model.instanceAccentColor}
                            isFavorite={favoritesSet.has(modelKey)}
                            isSelected={modelKey === `${props.activeInstanceId}:${props.model}`}
                            showProvider
                            preferShortName={!isLocked}
                            useTriggerLabel={false}
                            showNewBadge={isModelPickerNewModel(model.driverKind, model.slug)}
                            jumpLabel={modelJumpLabelByKey.get(modelKey) ?? null}
                            disabledReason={disabledReason}
                            onToggleFavorite={() => toggleFavorite(model.instanceId, model.slug)}
                          />
                        );
                      }}
                      estimatedItemSize={60}
                      drawDistance={480}
                      recycleItems
                      onLayout={updateModelListScrollFades}
                      onScroll={updateModelListScrollFades}
                      className={cn(
                        "scrollbar-gutter-both h-full overflow-x-hidden overscroll-y-contain py-1.5 [--fade-size:1.5rem]",
                        showTopScrollFade && "mask-t-from-[calc(100%-var(--fade-size))]",
                        showBottomScrollFade && "mask-b-from-[calc(100%-var(--fade-size))]",
                      )}
                    />
                  </ComboboxListVirtualized>
                  <ComboboxEmpty className="not-empty:py-6 empty:h-0 text-xs font-normal leading-snug">
                    No models found
                  </ComboboxEmpty>
                </>
              )}
            </div>
          </div>
        </Combobox>
      </div>
    </TooltipProvider>
  );
});
