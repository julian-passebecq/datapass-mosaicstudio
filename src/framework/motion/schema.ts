/** Keep the v1 schema immutable. Inherit value schemas, not its closed objects. */
const old = (path: string) => ({$ref: './motion.schema.json#/' + path});
const inherited = (path: string, keys: string[]) => Object.fromEntries(keys.map(key => [key, old(path + key)]));
const rootKeys = ['format', 'version', 'title', 'description', 'provenance', 'note', 'entities', 'links', 'steps', 'sources'];
const stepKeys = ['id', 'title', 'caption', 'focus', 'holdMs', 'transitionMs', 'commands', 'activeLinks', 'evidence'];
const stepPath = 'properties/steps/items/properties/';
const timing = {type: 'object', additionalProperties: false, required: ['startMs', 'endMs', 'easing'], properties: {
  startMs: {type: 'integer', minimum: 0, maximum: 1800}, endMs: {type: 'integer', minimum: 0, maximum: 1800}, easing: {enum: ['linear', 'cubic-in-out']},
}};
const entityPath = 'properties/entities/items/oneOf/', linkPath = 'properties/links/items/properties/';
const hexColor = {type: 'string', pattern: '^#[a-fA-F0-9]{6}$'};
/** Station and token keep their v1 value schemas; v2 widens the numeric caps only through `scene` (runtime-checked). */
const looseNumber = {type: 'number', minimum: -400, maximum: 400};
const looseNumber3 = {type: 'array', minItems: 3, maxItems: 3, items: looseNumber};
const stationKeys = ['id', 'label', 'description', 'color', 'evidence'];
const v2Entities = {type: 'array', minItems: 1, maxItems: 40, items: {oneOf: [
  {type: 'object', additionalProperties: false, required: [...stationKeys, 'kind', 'position', 'size'], properties: {
    ...inherited(entityPath + '0/properties/', [...stationKeys, 'kind']), position: looseNumber3, size: {...looseNumber3, items: {type: 'number', minimum: .1, maximum: 64}}, glyph: old(stepPath + 'id'),
  }},
  old('properties/entities/items/oneOf/1'),
]}};
const attach = {enum: ['top', 'base', 'surface', 'side']};
const v2Links = {type: 'array', maxItems: 64, items: {type: 'object', additionalProperties: false, required: ['id', 'from', 'to', 'label', 'via'], properties: {
  ...inherited(linkPath, ['id', 'from', 'to', 'label']), via: {type: 'array', maxItems: 8, items: looseNumber3},
  style: {enum: ['solid', 'dashed']}, attach: {type: 'object', additionalProperties: false, required: ['from', 'to'], properties: {from: attach, to: attach}},
}}};
const v2Layers = {type: 'array', minItems: 1, maxItems: 12, items: {type: 'object', additionalProperties: false, required: ['id', 'label', 'z', 'color'], properties: {
  id: old(stepPath + 'id'), label: {type: 'string', minLength: 1, maxLength: 80}, z: looseNumber, color: hexColor, texture: {enum: ['plain', 'water']},
  extent: {type: 'array', minItems: 4, maxItems: 4, items: looseNumber},
}}};
const v2Groups = {type: 'array', maxItems: 24, items: {type: 'object', additionalProperties: false, required: ['id', 'layer', 'members', 'color'], properties: {
  id: old(stepPath + 'id'), label: {type: 'string', minLength: 1, maxLength: 80}, layer: old(stepPath + 'id'), color: hexColor,
  members: {type: 'array', minItems: 1, maxItems: 40, uniqueItems: true, items: old(stepPath + 'id')},
}}};
const v2Scene = {type: 'object', additionalProperties: false, properties: {
  stationSize: {type: 'number', minimum: 8, maximum: 64}, positionRange: {type: 'number', minimum: 30, maximum: 400},
  labels: {enum: ['auto', 'attached']}, linkCasing: {type: 'boolean'}, linkCorner: {type: 'number', minimum: 0, maximum: 40}, header: {type: 'boolean'}, background: hexColor,
  legend: {type: 'object', additionalProperties: false, required: ['solid', 'dashed'], properties: {solid: {type: 'string', minLength: 1, maxLength: 60}, dashed: {type: 'string', minLength: 1, maxLength: 60}}},
}};
/** Runtime validation also checks ordering, step duration, semantic identities and source ranges. */
export const motionV2Schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'DataPass authored motion v2',
  type: 'object', additionalProperties: false, required: rootKeys, $defs: {timing},
  properties: {...inherited('properties/', rootKeys), version: {const: 2}, provenance: {enum: ['synthetic', 'authored', 'recorded']},
    entities: v2Entities, links: v2Links, layers: v2Layers, groups: v2Groups, scene: v2Scene, steps: {
    type: 'array', minItems: 1, maxItems: 64, items: {type: 'object', additionalProperties: false, required: stepKeys, properties: {
      ...inherited(stepPath, stepKeys),
      commands: {type: 'array', maxItems: 80, items: {oneOf: [...['position', 'link', 'value', 'visible'].map((payload, i) => ({
        type: 'object', additionalProperties: false, required: ['type', 'entity', payload], properties: {
          ...inherited(stepPath + 'commands/items/oneOf/' + i + '/properties/', ['type', 'entity', payload]), timing: {$ref: '#/$defs/timing'},
        },
      })), {
        // V2 only: change an entity's displayed label in place; identity is unchanged.
        type: 'object', additionalProperties: false, required: ['type', 'entity', 'text'], properties: {
          type: {const: 'label'}, entity: old(stepPath + 'commands/items/oneOf/0/properties/entity'), text: {type: 'string', minLength: 1, maxLength: 80}, timing: {$ref: '#/$defs/timing'},
        },
      }]}},
      annotations: {type: 'array', maxItems: 6, items: {type: 'object', additionalProperties: false, required: ['id', 'entity', 'text', 'offset', 'evidence'], properties: {
        id: old(stepPath + 'id'), entity: old(stepPath + 'id'), text: {type: 'string', minLength: 1, maxLength: 160},
        offset: {type: 'array', minItems: 2, maxItems: 2, items: {type: 'number', minimum: -280, maximum: 280}}, evidence: old(stepPath + 'evidence'),
      }}},
    }},
  }},
};
