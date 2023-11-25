export type Enum = {
  type: "enum";
  name: string;
  values: string[];
};

export type Model = {
  type: "model";
  name: string;
  fields: Record<
    string,
    { dataType: FieldDataType; assertions: FieldAssertion[]; ignore?: true }
  >;
  assertions: Index[];
};

export type View = {
  type: "view";
} & Omit<Model, "type">;

export type Generator = {
  type: "generator";
} & Record<string, string>;

export type DataSource = {
  type: "datasource";
  provider: string;
  url: string;
  extensions?: string;
} & Record<string, string>;

export type AST = View | Generator | DataSource | Model | Enum;

export type AllAST = {
  models: Record<string, Model>;
  views: Record<string, View>;
  generators: Record<string, Generator>;
  datasources: Record<string, DataSource>;
  enums: Record<string, Enum>;
};

//

export type Index = {
  type: "index" | "unique";
  fields: {
    name: string;
    sort?: "Asc" | "Desc";
    ops?: string;
  }[];
  using?: string;
};

export type FieldDataType = {
  name: string;
  otherCount?: "maybe" | "many";
};

export type RelationAssertion = {
  type: "relation";
  fields: string;
  references: string;
  model: string;
  name?: string;
  onDelete?: string;
  onUpdate?: string;
};

export type PrimaryKeyAssertion = {
  type: "primaryKey";
};

export type DefaultAssertion = {
  type: "default";
  value: string;
};

export type FieldAssertion =
  | DefaultAssertion
  | PrimaryKeyAssertion
  | RelationAssertion;
