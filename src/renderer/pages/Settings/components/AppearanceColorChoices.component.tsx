import { Xmark } from 'iconoir-react/regular';
import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';

import { Button } from '../../../components/Button/Button.component';
import { IconButton } from '../../../components/IconButton/IconButton.component';
import { favoriteNameMaxLength, parseHexColor, readFavoriteName } from '../../../theme';
import type { ColorSelection, Favorite } from '../../../theme.types';

const modes = [
  { id: 'dynamic', label: 'Dynamic' },
  { id: 'static', label: 'Static' },
] as const;

export function AppearanceColorChoices<T>({
  name,
  title,
  value,
  favorites,
  swatch,
  onChange,
  onRemove,
  onRename,
}: {
  name: 'accent' | 'gradient';
  title: string;
  value: ColorSelection;
  favorites: Favorite<T>[];
  swatch: (color: T) => string;
  onChange: (selection: ColorSelection) => void;
  onRemove: (favorite: Favorite<T>) => void;
  onRename: (favorite: Favorite<T>, name: string | undefined) => void;
}) {
  return (
    <fieldset className="appearance-color-picker">
      <legend>{title}</legend>
      <div className="appearance-color-choices">
        {modes.map(({ id, label }) => (
          <label className="theme-choice theme-choice-label appearance-color-choice" key={id}>
            <input
              type="radio"
              name={`${name}-mode`}
              value={id}
              checked={value.mode === id}
              onChange={() => onChange({ ...value, mode: id })}
            />
            {label}
          </label>
        ))}
      </div>
      {value.mode === 'dynamic' ? (
        <p className="appearance-dynamic-hint">Follows Now Playing artwork.</p>
      ) : (
        <div className="appearance-color-choices">
          {favorites.map((favorite) => (
            <FavoriteChoice
              key={favorite.id}
              group={name}
              favorite={favorite}
              checked={value.choice === favorite.id}
              swatch={swatch(favorite.color)}
              onSelect={() => onChange({ ...value, choice: favorite.id })}
              onRemove={() => onRemove(favorite)}
              onRename={(name) => onRename(favorite, name)}
            />
          ))}
          <label className="theme-choice theme-choice-label appearance-color-choice">
            <input
              type="radio"
              name={name}
              value="custom"
              checked={value.choice === 'custom'}
              onChange={() => onChange({ ...value, choice: 'custom' })}
            />
            Custom
          </label>
        </div>
      )}
    </fieldset>
  );
}

export function CustomColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  const [hexDraft, setHexDraft] = useState<string | null>(null);

  function changeColor(color: string) {
    const hex = parseHexColor(color);
    if (hex && hex !== value) onChange(hex);
  }

  return (
    <div className="appearance-custom-color">
      <span>{label}</span>
      <div className="appearance-custom-color-value">
        <input
          type="color"
          aria-label={label}
          value={value}
          onInput={(event) => changeColor(event.currentTarget.value)}
          onChange={(event) => changeColor(event.currentTarget.value)}
        />
        <input
          type="text"
          aria-label={`${label} hex`}
          value={hexDraft ?? value.toUpperCase()}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => {
            const hex = event.currentTarget.value;
            setHexDraft(hex);
            changeColor(hex);
          }}
          onBlur={() => setHexDraft(null)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </div>
    </div>
  );
}

function focusFavoriteName(input: HTMLInputElement | null) {
  input?.focus();
  input?.select();
}

function FavoriteChoice<T>({
  group,
  favorite,
  checked,
  swatch,
  onSelect,
  onRemove,
  onRename,
}: {
  group: string;
  favorite: Favorite<T>;
  checked: boolean;
  swatch: string;
  onSelect: () => void;
  onRemove: () => void;
  onRename: (name: string | undefined) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const pointerDown = useRef(false);
  const resizeAfterClick = useRef(false);
  const editing = draft !== null;
  const Tile = editing ? 'div' : 'label';

  useLayoutEffect(() => {
    if (!editing) return;
    let resizeTimer: ReturnType<typeof setTimeout>;

    function holdWidth(event: PointerEvent) {
      if (event.isPrimary && event.button === 0) pointerDown.current = true;
    }

    function releaseWidth() {
      pointerDown.current = false;
      if (!resizeAfterClick.current) return;
      resizeAfterClick.current = false;
      // Let the browser dispatch the click before a shorter tile moves its target.
      resizeTimer = setTimeout(() => setDraft(null), 0);
    }

    window.addEventListener('pointerdown', holdWidth, true);
    window.addEventListener('pointerup', releaseWidth, true);
    window.addEventListener('pointercancel', releaseWidth, true);
    window.addEventListener('blur', releaseWidth);

    return () => {
      window.removeEventListener('pointerdown', holdWidth, true);
      window.removeEventListener('pointerup', releaseWidth, true);
      window.removeEventListener('pointercancel', releaseWidth, true);
      window.removeEventListener('blur', releaseWidth);
      clearTimeout(resizeTimer);
      pointerDown.current = false;
      resizeAfterClick.current = false;
    };
  }, [editing]);

  return (
    <div className="appearance-favorite">
      <Tile
        className="theme-choice theme-choice-label appearance-color-choice"
        title={favorite.saved ? `${favorite.label} (double-click to rename)` : undefined}
        onDoubleClick={favorite.saved && !editing ? () => setDraft(favorite.label) : undefined}
      >
        <input
          type="radio"
          name={group}
          value={favorite.id}
          checked={checked}
          aria-label={favorite.label}
          aria-keyshortcuts={favorite.saved ? 'F2' : undefined}
          onChange={onSelect}
          onKeyDown={(event) => {
            if (favorite.saved && event.key === 'F2') {
              event.preventDefault();
              setDraft(favorite.label);
            }
          }}
        />
        {draft === null ? (
          <span className="appearance-favorite-name">{favorite.label}</span>
        ) : (
          <input
            className="appearance-favorite-rename"
            type="text"
            aria-label={`Rename ${group} ${favorite.label}`}
            ref={focusFavoriteName}
            value={draft}
            maxLength={favoriteNameMaxLength}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={() => {
              const name = readFavoriteName(draft);
              if (name !== favorite.label) onRename(name);
              if (pointerDown.current) resizeAfterClick.current = true;
              else setDraft(null);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') setDraft(null);
            }}
          />
        )}
        <span className="appearance-color-swatch" style={{ '--swatch': swatch } as CSSProperties} aria-hidden="true" />
      </Tile>
      {favorite.saved && (
        <IconButton
          className="appearance-remove-favorite"
          label={`Remove ${group} favorite ${favorite.label}`}
          onClick={(event) => {
            event.currentTarget.closest('fieldset')?.querySelector<HTMLInputElement>('input[value="custom"]')?.focus();
            onRemove();
          }}
        >
          <Xmark width={14} height={14} aria-hidden="true" />
        </IconButton>
      )}
    </div>
  );
}

export function SaveColorFavorite({
  kind,
  saved,
  onSave,
}: {
  kind: 'accent' | 'gradient';
  saved: boolean;
  onSave: (name: string | undefined) => void;
}) {
  const [name, setName] = useState('');

  return (
    <form
      className="appearance-save-color"
      onSubmit={(event) => {
        event.preventDefault();
        if (saved) return;
        onSave(readFavoriteName(name));
        setName('');
      }}
    >
      {!saved && (
        <label className="appearance-custom-color">
          Name
          <input
            type="text"
            aria-label={`${kind === 'accent' ? 'Accent' : 'Gradient'} name`}
            placeholder="Optional"
            maxLength={favoriteNameMaxLength}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>
      )}
      <Button className="appearance-save-favorite" type="submit" aria-disabled={saved}>
        {saved ? 'Saved to Favorites' : 'Save to Favorites'}
      </Button>
    </form>
  );
}
