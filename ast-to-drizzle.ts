import { AllAST, DataSource, Enum, FieldDataType, Model } from "./ast";

export function ASTToDrizzle(ast: AllAST) {
  return `import * as d from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
${handleDataSources(Object.entries(ast.datasources))}

const unsupported = d.customType({
  dataType(config) {
    if (
      config == null ||
      typeof config !== "object" ||
      !("type" in config) ||
      typeof config.type !== "string"
    ) {
      throw new Error("Unsupported was used without config");
    }
    return config.type;
  },
});

// ┌─────────────┐
// │    Enums    │
// └─────────────┘

${Object.values(ast.enums).map(mapEnum).join("\n\n")}

// ┌──────────────┐
// │    Models    │
// └──────────────┘

${Object.values(ast.models)
  .map((model) => mapModel(model, ast))
  .join("\n\n")}
`;
}

function mapEnum(e: Enum) {
  return `export const ${e.name} = d.pgEnum("${e.name}",
  ${JSON.stringify(e.values)}
);`;
}

function mapModel(model: Model, ast: AllAST) {
  return `export const ${model.name} = d.pgTable("${model.name}", {
  ${Object.entries(model.fields)
    .map((field) => mapModelField(field, ast))
    .filter(Boolean)
    .join(",\n  ")}
});`;
}

function mapModelField(
  [name, field]: [string, Model["fields"][string]],
  ast: AllAST
) {
  if (
    ast.models[field.dataType.name] != null ||
    ast.views[field.dataType.name] != null
  ) {
    return null;
  }

  return `${name}: ${getDataType(name, field, ast)}${withCount(
    field
  )}${withAssertions(field)}`;
}

function getDataType(
  name: string,
  field: Model["fields"][string],
  ast: AllAST
) {
  if (ast.enums[field.dataType.name]) {
    return `${field.dataType.name}("${name}")`;
  }
  if (field.dataType.name.startsWith("Unsupported")) {
    const type = field.dataType.name.slice(12, -1);
    return `unsupported("${name}", { type: ${type} })`;
  }
  switch (field.dataType.name) {
    case "String":
      return `d.text("${name}")`;
    case "DateTime":
      return `d.timestamp("${name}")`;
    case "Json":
      return `d.json("${name}")`;
    case "Int":
      return `d.integer("${name}")`;
    case "Boolean":
      return `d.boolean("${name}")`;
    case "SmallInt":
      return `d.smallint("${name}")`;
    default:
      throw `Could not convert ${name}: ${JSON.stringify(field)}`;
  }
}

function withCount(field: Model["fields"][string]) {
  switch (field.dataType.otherCount) {
    case "many":
      return ".array()";
    case "maybe":
      return "";
    case undefined:
      return ".notNull()";
    default:
      throw `Could not create countability for ${JSON.stringify(field)}`;
  }
}

function withAssertions(field: Model["fields"][string]) {
  let assertions = "";
  for (const assertion of field.assertions) {
    switch (assertion.type) {
      case "primaryKey":
        assertions += ".primaryKey()";
        break;
      case "default":
        assertions += `.default(sql\`${assertion.value}\`)`;
        break;
      case "relation":
        const onDelete = mapOnDelete(assertion.onDelete);
        const onUpdate = mapOnDelete(assertion.onDelete);
        let options = "";
        if (onDelete != null || onUpdate != null) {
          options += ", { ";
          if (onDelete != null) options += `onDelete: "${onDelete}", `;
          if (onUpdate != null) options += `onUpdate: "${onUpdate}", `;
          options += "}";
        }
        assertions += `.references((): d.AnyPgColumn => ${assertion.model}.${assertion.references}${options})`;
        break;
      default:
        throw `Could not create assertion for ${JSON.stringify(field)}`;
    }
  }
  return assertions;
}

function mapOnDelete(onDelete: string | undefined) {
  switch (onDelete) {
    case undefined:
      return;
    case "Cascade":
      return "cascade";
    case "SetNull":
      return "set null";
    case "NoAction":
      return "no action";
    case "Restrict":
      return "restrict";
    case "SetDefault":
      return "set default";
    default:
      throw `Could not map onDelete for '${onDelete}'`;
  }
}

function handleDataSources(sources: [string, DataSource][]) {
  if (sources.length === 0) return "";
  const imports = new Set<string>();
  const clients: string[] = [];
  for (const [name, ds] of sources) {
    imports.add(mapProvider(ds.provider));
    clients.push(mapClient(name, ds));
  }
  return `${[...imports.values()].join("\n")}

${clients.join("\n\n")}`;
}

function mapProvider(provider: string) {
  switch (provider) {
    case '"postgresql"':
      return `import postgres from "postgres";
import { drizzle as pgDrizzle } from "drizzle-orm/postgres-js";`;
    default:
      throw `Could not map provider for ${provider}`;
  }
}

function mapClient(name: string, ds: DataSource) {
  const [client, drizzle] = mapProviderClient(ds.provider, ds.url);
  return `export const ${name}Client = ${client};
export const ${name} = ${drizzle}(${name}Client);`;
}

function mapProviderClient(provider: string, url: string) {
  const fixedUrl = url.replace("env(", "process.env[").replace(")", "]!");
  switch (provider) {
    case '"postgresql"':
      return [`postgres(${fixedUrl})`, "pgDrizzle"];
    default:
      throw `Could not map provider client for ${provider}`;
  }
}
