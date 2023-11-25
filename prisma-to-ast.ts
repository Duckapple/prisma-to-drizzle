import Bun from "bun";
import type {
  AST,
  AllAST,
  DataSource,
  Enum,
  FieldDataType,
  Generator,
  Index,
  Model,
  RelationAssertion,
  View,
} from "./ast";

export function prismaToAST(prismaText: string) {
  const prismaLines = prismaText
    .split("\n")
    .map((s) => s.split("//")[0].trim())
    .filter(Boolean);

  const ast: AllAST = {
    models: {},
    views: {},
    generators: {},
    datasources: {},
    enums: {},
  };

  let current: AST = {} as AST;

  let relationFields = [] as [string, RelationAssertion][];

  for (const line of prismaLines) {
    if (line === "}") {
      if (relationFields.length !== 0) {
        for (const [name, assertion] of relationFields) {
          try {
            (current as Model).fields[name].assertions.push(assertion);
          } catch (e) {
            console.error(name, assertion, current);
            throw e;
          }
        }
      }
      relationFields = [];
      current = {} as typeof current;
      continue;
    }
    if (line.startsWith("model ")) {
      const model = line.slice(6, -2);
      const c = current as Model;
      c.type = "model";
      ast.models[model] = c;
      c.name = model;
      c.fields = {};
      c.assertions = [];
      continue;
    }
    if (line.startsWith("view ")) {
      const view = line.slice(5, -2);
      const c = current as View;
      c.type = "view";
      ast.views[view] = c as View;
      c.name = view;
      c.fields = {};
      c.assertions = [];
      continue;
    }
    if (line.startsWith("enum ")) {
      const e = line.slice(5, -2);
      const c = current as Enum;
      c.type = "enum";
      ast.enums[e] = c;
      c.name = e;
      c.values = [];
      continue;
    }
    if (line.startsWith("generator ")) {
      const generator = line.slice(10, -2);
      current.type = "generator";
      ast.generators[generator] = current as Generator;
      continue;
    }
    if (line.startsWith("datasource ")) {
      const datasource = line.slice(11, -2);
      current.type = "datasource";
      ast.datasources[datasource] = current as DataSource;
      continue;
    }
    switch (current.type) {
      case "model":
        handleModel(line, current, relationFields);
        break;
      case "view":
        handleModel(line, current, relationFields);
        break;
      case "enum":
        current.values.push(line);
        break;
      case "generator": {
        const [key, value] = line.split(" = ").map((s) => s.trim());
        current[key] = value;
        break;
      }
      case "datasource": {
        const [key, value] = line.split(" = ").map((s) => s.trim());
        current[key] = value;
        break;
      }
    }
  }
  return ast;
}

function handleModel(
  line: string,
  current: Model | View,
  relationFields: [string, RelationAssertion][]
) {
  if (line.startsWith("@@index") || line.startsWith("@@unique")) {
    const indexType = line.slice(2, line.indexOf("("));
    const content = line.slice(indexType.length + 3, -1);
    const index: Index = {
      type: indexType as "index" | "unique",
      fields: [],
    };
    const type = /type: (.+?)$/.exec(content);
    if (type != null) {
      index.using = type[1];
    }
    if (content.startsWith("[")) {
      const elements = content.slice(1, content.indexOf("]")).split(", ");
      index.fields = elements.map(indexField);
    } else {
      index.fields = [indexField(content)];
    }
    current.assertions.push(index);
    return;
  }
  if (line.startsWith("@@")) {
    console.error("Unsupported block attribute:", line);
    throw null;
  }
  const [, name, type, rest] = /^(.+?)\s+(.+?)(:?\s+(.+))?$/.exec(line) ?? [];
  const field = {} as Model["fields"][string];
  field.dataType = fieldType(type);
  field.assertions = [];

  const regex = /@[\w.]+(?:\([^@]+\))?/g;
  for (const match of regex.exec(rest) ?? []) {
    if (match === "@id") {
      field.assertions.push({ type: "primaryKey" });
    } else if (match === "@unique") {
      current.assertions.push({ type: "unique", fields: [{ name }] });
    } else if (match.startsWith("@default")) {
      const value = match.slice(9, -1);
      field.assertions.push({ type: "default", value });
    } else if (match.startsWith("@db.")) {
      const [, type] = match.split(".");
      field.dataType = fieldType(type);
    } else if (match.startsWith("@relation")) {
      field.ignore = true;

      const content = match
        .slice(10, -1)
        .split(", ")
        .map((s) => s.split(": "))
        .filter((arr) => arr.length > 1 && arr[0] !== "name");

      if (content.length > 0) {
        const relation = {
          type: "relation",
          model: field.dataType.name,
        } as RelationAssertion;
        for (const [k, v] of content) {
          const value = v.includes("[") ? v.slice(1, -1) : v;
          (relation as Record<string, string>)[k] = value;
        }
        relationFields.push([relation.fields, relation]);
      }
    } else {
      console.error("Unsupported field attribute:", match, "from", line);
      throw null;
    }
  }

  if (!field.ignore) {
    current.fields[name] = field;
  }
}

function indexField(f: string): Index["fields"][number] {
  if (!f.includes("(")) return { name: f };
  const [name, ...rest] = f.split("(");
  const mods = rest.join("(").slice(0, -1).split(", ");
  const result = { name } as Index["fields"][number];
  for (const mod of mods) {
    const [k, v] = mod.split(": ");
    if (k === "sort" && ["Asc", "Desc"].includes(v)) {
      result[k] = v as "Asc" | "Desc";
      continue;
    }
    if (k === "ops") {
      const match = /raw\("(.+?)"\)|(.+)/.exec(v);
      result[k] = match?.[1] || match?.[2] || undefined;
      continue;
    }
    console.warn("Could not understand field modifier", mod, "on field", name);
  }
  return result;
}

function fieldType(type: string): FieldDataType {
  if (type.endsWith("[]")) {
    return { name: type.slice(0, -2), otherCount: "many" };
  } else if (type.endsWith("?")) {
    return { name: type.slice(0, -1), otherCount: "maybe" };
  }
  return { name: type };
}
