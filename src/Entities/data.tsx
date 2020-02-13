import { runQuery } from "../queries";

export const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
export const RDFS_LABEL = RDFS + "label";
export const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
export const RDF_TYPE = RDF + "type";
export const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";

export type Suggestion = {
  value: string;
  label: string | { "@value": string; "@type": string };
};

type JsonLdReference = { "@id": string };
type JsonLdValue =
  | { "@value": string; "@language": string }
  | { "@value": string; "@type": string };

export type EntityValue = JsonLdReference | JsonLdValue | string;
export type Label = string | JsonLdValue;

export type EntityValueRecord = {
  id: JsonLdReference;
  property: JsonLdReference;
  value: EntityValue;
  label?: Label;
};

type GizmoQueryResult<T extends Object> =
  | { result: T[] | null }
  | { error: string };

export type Entity = { [key: string]: EntityValueRecord[] };

export async function getEntity(
  serverURL: string,
  entityID: string
): Promise<Entity | null> {
  const result: GizmoQueryResult<EntityValueRecord> = await runQuery(
    serverURL,
    "gizmo",
    `
      g.addDefaultNamespaces();
      g
      .V(g.IRI("${entityID}"))
      .out(g.V(), "property")
      .tag("value")
      .saveOpt(g.IRI("rdfs:label"), "label")
      .getLimit(-1);
    `
  );
  if ("error" in result) {
    throw new Error(result.error);
  }
  if (result.result === null) {
    return null;
  }
  const properties: Entity = {};
  for (const record of result.result) {
    const values = properties[record.property["@id"]] || [];
    properties[record.property["@id"]] = [...values, record];
  }
  return properties;
}

const AUTO_SUGGESTION_RESULT_LIMIT = 12;

export async function getAutoCompletionSuggestions(
  serverURL: string,
  entityIDPrefix: string
): Promise<Suggestion[]> {
  const result = await runQuery(
    serverURL,
    "gizmo",
    `
  g.addDefaultNamespaces();
  
  var labelResults = g.V()
    .tag("entity")
    .out(g.IRI("rdfs:label"))
    .tag("label")
    .filter(like("${entityIDPrefix}%"))
    .limit(${AUTO_SUGGESTION_RESULT_LIMIT});
  
  var iriResults = g.V()
    .tag("entity")
    .filter(like("${entityIDPrefix}%"))
    .limit(${AUTO_SUGGESTION_RESULT_LIMIT});
  
  labelResults
    .union(iriResults)
    .getLimit(${AUTO_SUGGESTION_RESULT_LIMIT});
    `
  );
  if ("error" in result) {
    throw new Error(result.error);
  }
  const results = result.result || [];
  return results
    .filter(result => "@id" in result.entity)
    .map(
      (result): Suggestion => {
        return {
          label: result.label
            ? typeof result.label === "object" && "@value" in result.label
              ? result.label["@value"]
              : result.label
            : result.entity["@id"],
          value: result.entity["@id"]
        };
      }
    );
}
