/** Keep the v1 schema immutable. Inherit value schemas, not its closed objects. */
const old = (path: string) => ({$ref: './motion.schema.json#/' + path});
const inherited = (path: string, keys: string[]) => Object.fromEntries(keys.map(key => [key, old(path + key)]));
const rootKeys = ['format', 'version', 'title', 'description', 'provenance', 'note', 'entities', 'links', 'steps', 'sources'];
const stepKeys = ['id', 'title', 'caption', 'focus', 'holdMs', 'transitionMs', 'commands', 'activeLinks', 'evidence'];
const stepPath = 'properties/steps/items/properties/';
const timing = {type: 'object', additionalProperties: false, required: ['startMs', 'endMs', 'easing'], properties: {
  startMs: {type: 'integer', minimum: 0, maximum: 1800}, endMs: {type: 'integer', minimum: 0, maximum: 1800}, easing: {enum: ['linear', 'cubic-in-out']},
}};
/** Runtime validation also checks ordering, step duration, semantic identities and source ranges. */
export const motionV2Schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'DataPass authored motion v2',
  type: 'object', additionalProperties: false, required: rootKeys, $defs: {timing},
  properties: {...inherited('properties/', rootKeys), version: {const: 2}, provenance: {enum: ['synthetic', 'authored', 'recorded']}, steps: {
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
