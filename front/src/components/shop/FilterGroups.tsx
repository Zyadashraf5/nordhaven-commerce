'use client';

import { Icon } from '../ui/Icon';
import type {
  CatalogListing,
  FacetOption,
  ListingQuery,
  ListingTypeFilter,
} from '../../lib/listing';
import { facetOptions, facetSwitchCounts } from '../../lib/listing';
import type { CatalogFacets } from '../../lib/catalog-facets';
import { catalogPriceBands } from '../../data/catalog-sample';
import styles from './ProductListing.module.css';

/**
 * The approved facet rail: Availability switches, then Category, Product
 * type, Price, Colour, Material and Brand groups. Counts are computed by the
 * pure engine over the current query, exactly as the boards demonstrate.
 *
 * Rendered twice: as the sticky desktop sidebar and inside the mobile filter
 * sheet — one DOM shape, two placements.
 */

export interface FilterGroupProps {
  listings: CatalogListing[];
  facets: CatalogFacets;
  query: ListingQuery;
  onToggleCategory: (slug: string) => void;
  onToggleType: (id: ListingTypeFilter) => void;
  onTogglePriceBand: (id: string) => void;
  onToggleColour: (id: string) => void;
  onToggleMaterial: (material: string) => void;
  onToggleBrand: (slug: string) => void;
  onToggleInStock: () => void;
  onToggleOnOffer: () => void;
  ids?: string | undefined;
}

const TYPE_OPTIONS: { value: ListingTypeFilter; label: string }[] = [
  { value: 'single', label: 'Single products' },
  { value: 'fixed-set', label: 'Ready-packed sets' },
  { value: 'dynamic-set', label: 'Sets of individual items' },
];

export function FilterGroups(props: FilterGroupProps) {
  const { listings, query, facets } = props;
  const prefix = props.ids ?? 'fl';

  const categoryOptions = facetOptions(
    listings,
    query,
    'categories',
    facets.categories.map((pill) => ({ value: pill.slug, label: pill.label })),
  );
  const typeOptions = facetOptions(listings, query, 'types', TYPE_OPTIONS);
  const priceOptions = facetOptions(
    listings,
    query,
    'priceBands',
    catalogPriceBands.map((band) => ({
      value: band.id,
      label: band.label,
    })),
  );
  const colourOptions = facetOptions(
    listings,
    query,
    'colours',
    facets.colours.map((colour) => ({
      value: colour.id,
      label: colour.label,
      hex: colour.hex,
    })),
  );
  const materialOptions = facetOptions(
    listings,
    query,
    'materials',
    facets.materials.map((material) => ({
      value: material,
      label: material,
    })),
  );
  const brandOptions = facetOptions(
    listings,
    query,
    'brands',
    facets.brands.map((brand) => ({
      value: brand.slug,
      label: brand.name,
    })),
  );

  const inStockCandidates = facetSwitchCounts(listings, query, 'inStockOnly');
  const onOfferCandidates = facetSwitchCounts(listings, query, 'onOfferOnly');

  return (
    <>
      <details className={styles.group} open>
        <summary className={styles.groupSummary}>
          Availability
          <Icon name="chevron-down" size={16} strokeWidth={2} className={styles.groupChevron} />
        </summary>
        <div className={styles.groupBody} role="group" aria-label="Availability">
          {/* The live catalogue API has no stock figure, so the switch is only
              offered when the listings carry one. */}
          {facets.showStockSwitch ? (
            <button
              type="button"
              role="switch"
              aria-checked={query.inStockOnly}
              id={`${prefix}-stock`}
              className={styles.switchRow}
              onClick={props.onToggleInStock}
            >
              In stock only
              <span className={styles.switchTrack}>
                <span className={styles.switchKnob} />
              </span>
            </button>
          ) : null}
          <button
            type="button"
            role="switch"
            aria-checked={query.onOfferOnly}
            id={`${prefix}-offer`}
            className={styles.switchRow}
            onClick={props.onToggleOnOffer}
          >
            On offer
            <span className={styles.switchTrack}>
              <span className={styles.switchKnob} />
            </span>
          </button>
          <span className="hw-visually-hidden" aria-live="polite">
            {facets.showStockSwitch ? `${inStockCandidates} products are in stock, ` : ''}
            {onOfferCandidates} on offer.
          </span>
        </div>
      </details>

      <details className={styles.group} open>
        <summary className={styles.groupSummary}>
          Category
          <Icon name="chevron-down" size={16} strokeWidth={2} className={styles.groupChevron} />
        </summary>
        <div className={styles.groupBody} role="group" aria-label="Category">
          {categoryOptions.map((option) => (
            <OptionRow
              key={option.value}
              id={`${prefix}-cat-${option.value}`}
              option={option}
              checked={query.categories.includes(option.value)}
              round={false}
              onToggle={() => props.onToggleCategory(option.value)}
            />
          ))}
        </div>
      </details>

      {facets.showTypeFilter ? (
        <details className={styles.group} open>
          <summary className={styles.groupSummary}>
            Product type
            <Icon name="chevron-down" size={16} strokeWidth={2} className={styles.groupChevron} />
          </summary>
          <div className={styles.groupBody} role="group" aria-label="Product type">
            {typeOptions.map((option) => (
              <OptionRow
                key={option.value}
                id={`${prefix}-type-${option.value}`}
                option={option}
                checked={(query.types as string[]).includes(option.value)}
                round={false}
                onToggle={() => props.onToggleType(option.value as ListingTypeFilter)}
              />
            ))}
          </div>
        </details>
      ) : null}

      <details className={styles.group} open>
        <summary className={styles.groupSummary}>
          Price
          <Icon name="chevron-down" size={16} strokeWidth={2} className={styles.groupChevron} />
        </summary>
        <div className={styles.groupBody} role="group" aria-label="Price">
          {priceOptions.map((option) => (
            <OptionRow
              key={option.value}
              id={`${prefix}-price-${option.value}`}
              option={option}
              checked={query.priceBands.includes(option.value)}
              round
              onToggle={() => props.onTogglePriceBand(option.value)}
            />
          ))}
        </div>
      </details>

      <details className={styles.group} open>
        <summary className={styles.groupSummary}>
          Colour
          <Icon name="chevron-down" size={16} strokeWidth={2} className={styles.groupChevron} />
        </summary>
        <div className={styles.colourRow} role="group" aria-label="Colour">
          {colourOptions.map((option) => {
            const checked = query.colours.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="checkbox"
                aria-checked={checked}
                id={`${prefix}-colour-${option.value}`}
                className={styles.colourChip}
                onClick={() => props.onToggleColour(option.value)}
              >
                <span className={styles.colourDot} style={{ background: option.hex }} />
                {option.label}
              </button>
            );
          })}
        </div>
      </details>

      <details className={styles.group} open>
        <summary className={styles.groupSummary}>
          Material
          <Icon name="chevron-down" size={16} strokeWidth={2} className={styles.groupChevron} />
        </summary>
        <div className={styles.groupBody} role="group" aria-label="Material">
          {materialOptions.map((option) => (
            <OptionRow
              key={option.value}
              id={`${prefix}-material-${option.value}`}
              option={option}
              checked={query.materials.includes(option.value)}
              round={false}
              onToggle={() => props.onToggleMaterial(option.value)}
            />
          ))}
        </div>
      </details>

      <details className={styles.group} open>
        <summary className={styles.groupSummary}>
          Brand
          <Icon name="chevron-down" size={16} strokeWidth={2} className={styles.groupChevron} />
        </summary>
        <div className={styles.groupBody} role="group" aria-label="Brand">
          {brandOptions.map((option) => (
            <OptionRow
              key={option.value}
              id={`${prefix}-brand-${option.value}`}
              option={option}
              checked={query.brands.includes(option.value)}
              round={false}
              onToggle={() => props.onToggleBrand(option.value)}
            />
          ))}
        </div>
      </details>
    </>
  );
}

function OptionRow({
  option,
  checked,
  round,
  onToggle,
  id,
}: {
  id: string;
  option: FacetOption;
  checked: boolean;
  round: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      id={id}
      className={styles.optionRow}
      onClick={onToggle}
    >
      <span className={`${styles.optionMark} ${round ? styles.optionMarkRound : ''}`}>
        {checked ? <Icon name="check" size={13} strokeWidth={2.4} /> : null}
      </span>
      <span className={styles.optionLabel}>{option.label}</span>
      <span className={styles.optionCount}>{option.count}</span>
    </button>
  );
}
