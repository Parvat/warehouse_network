import { relations, sql } from 'drizzle-orm';
import {
  boolean, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

/**
 * TWO ROLES ONLY for v1: a dealer, and a provider the dealer invites.
 * Nine role types is a v3 problem — the schema below grows into it via
 * `capabilities` rather than new tables.
 */
export const orgKind = pgEnum('org_kind', ['dealer', 'provider', 'customer']);
export const capability = pgEnum('capability', [
  'rack_supply', 'installation', 'engineering', 'freight',
  'equipment_rental', 'inspection', 'accessories', 'design',
]);
export const memberRole = pgEnum('member_role', ['owner', 'admin', 'member']);
export const projectStage = pgEnum('project_stage', [
  'draft', 'estimating', 'quoting', 'awarded', 'in_progress', 'complete', 'archived',
]);
export const priceState = pgEnum('price_state', [
  'trace_estimate', 'provider_published', 'provider_confirmed', 'accepted',
]);
export const inviteStatus = pgEnum('invite_status', ['pending', 'accepted', 'declined', 'revoked']);

const id = () => uuid('id').primaryKey().defaultRandom();
const stamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/** A company. Clerk owns users and org membership; this is the business record. */
export const organizations = pgTable('organizations', {
  id: id(),
  clerkOrgId: text('clerk_org_id').notNull().unique(),
  name: text('name').notNull(),
  kind: orgKind('kind').notNull(),
  capabilities: capability('capabilities').array().notNull().default(sql`'{}'`),
  /** Where they are, for distance ranking. PostGIS geography(Point,4326). */
  location: text('location'),
  serviceRadiusMi: integer('service_radius_mi'),
  ...stamps,
}, (t) => ({ kindIdx: index('org_kind_idx').on(t.kind) }));

export const memberships = pgTable('memberships', {
  id: id(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  clerkUserId: text('clerk_user_id').notNull(),
  role: memberRole('role').notNull().default('member'),
  ...stamps,
}, (t) => ({ uniq: uniqueIndex('membership_uniq').on(t.organizationId, t.clerkUserId) }));

/**
 * The DURABLE object. A project is an episode in a warehouse's life —
 * the warehouse outlives every project run against it.
 */
export const warehouses = pgTable('warehouses', {
  id: id(),
  ownerOrgId: uuid('owner_org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  addressLine: text('address_line'),
  city: text('city'),
  region: text('region'),
  postalCode: text('postal_code'),
  location: text('location'),
  lengthFt: numeric('length_ft'),
  widthFt: numeric('width_ft'),
  clearHeightFt: numeric('clear_height_ft'),
  ...stamps,
});

export const projects = pgTable('projects', {
  id: id(),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'cascade' }),
  /** Null until the anonymous estimate is claimed by an account. */
  ownerOrgId: uuid('owner_org_id').references(() => organizations.id),
  /** Set on anonymous estimates so a returning visitor can resume. */
  anonymousToken: text('anonymous_token'),
  title: text('title').notNull(),
  stage: projectStage('stage').notNull().default('draft'),
  targetDate: timestamp('target_date', { withTimezone: true }),
  ...stamps,
}, (t) => ({
  warehouseIdx: index('project_warehouse_idx').on(t.warehouseId),
  tokenIdx: index('project_token_idx').on(t.anonymousToken),
}));

/**
 * One engine run, stored whole. `input` and `result` are the exact
 * EngineInput / EngineResult shapes from @trace/rack-engine, so a saved
 * estimate can always be replayed and re-rendered.
 */
export const layoutVersions = pgTable('layout_versions', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(),
  label: text('label').notNull().default('as-designed'),
  engineVersion: text('engine_version').notNull(),
  input: jsonb('input').notNull(),
  result: jsonb('result').notNull(),
  isLocked: boolean('is_locked').notNull().default(false),
  ...stamps,
}, (t) => ({ uniq: uniqueIndex('layout_rev_uniq').on(t.projectId, t.revision) }));

/** Every quantity a provider is asked to price traces back to a layout version. */
export const bomLines = pgTable('bom_lines', {
  id: id(),
  layoutVersionId: uuid('layout_version_id').notNull().references(() => layoutVersions.id, { onDelete: 'cascade' }),
  grouping: text('grouping').notNull(),
  item: text('item').notNull(),
  description: text('description').notNull(),
  qty: integer('qty').notNull(),
  unitWeightLb: numeric('unit_weight_lb'),
}, (t) => ({ versionIdx: index('bom_version_idx').on(t.layoutVersionId) }));

/** A provider brought onto a project. Dealer-invited in v1. */
export const projectProviders = pgTable('project_providers', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  capability: capability('capability').notNull(),
  status: inviteStatus('status').notNull().default('pending'),
  ...stamps,
}, (t) => ({ uniq: uniqueIndex('project_provider_uniq').on(t.projectId, t.organizationId, t.capability) }));

/**
 * PRIVACY BOUNDARY. `sellPrice` is customer-visible.
 * `costPrice` and everything derived from it is dealer-only and must never
 * be selected into a customer-facing query. Enforce in the data layer,
 * not the UI — the classic leak is a hidden field the client filters out.
 */
export const quotes = pgTable('quotes', {
  id: id(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  layoutVersionId: uuid('layout_version_id').notNull().references(() => layoutVersions.id),
  providerOrgId: uuid('provider_org_id').notNull().references(() => organizations.id),
  capability: capability('capability').notNull(),
  state: priceState('state').notNull().default('trace_estimate'),
  sellPrice: numeric('sell_price'),
  costPrice: numeric('cost_price'),
  currency: text('currency').notNull().default('USD'),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  notes: text('notes'),
  ...stamps,
}, (t) => ({ projectIdx: index('quote_project_idx').on(t.projectId) }));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  warehouses: many(warehouses),
}));
export const projectsRelations = relations(projects, ({ one, many }) => ({
  warehouse: one(warehouses, { fields: [projects.warehouseId], references: [warehouses.id] }),
  layoutVersions: many(layoutVersions),
  providers: many(projectProviders),
  quotes: many(quotes),
}));
export const layoutVersionsRelations = relations(layoutVersions, ({ one, many }) => ({
  project: one(projects, { fields: [layoutVersions.projectId], references: [projects.id] }),
  bomLines: many(bomLines),
}));
