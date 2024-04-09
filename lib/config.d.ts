import { TemplateDelegate } from "handlebars"


export interface Config {
  /** The project display name */
  projectDispName: string = ""

  /** When true, enables debug mode. */
  debug: boolean = false

  toc: TableOfContents

  /** A collection of folders to generate */
  folders: Folder[] = []

  /** Config options */
  options: Options
}

export interface TableOfContents {
  fileName: string = "index.md"
  /** The path to the template file, if any */
  template?: string
}

export interface Resource {
  source: string
  output: string
}

export interface Folder {
  /** Information about the  */
  source: Source
  /**  */
  output: Output
  /** The path to the template file, if any */
  template?: string
  /** The content of {@link template} */
  templateContent?: string
  /** The {@link templateContent} when compiled. */
  compiledTemplate?: TemplateDelegate<any>,
  /** Additional resources, if any. */
  resources: Resource[] = []
}

export interface Options {
  /**
   * Specifies whether to include private APIs in the docs.
   * Defaults to false.
   */
  includePrivateMembers: boolean = false
}

export interface Output {
  /** When true, delete all content from the output folder before generation. */
  delete: boolean = false
  /** The path to the output folder. */
  path: string
  /** An optional template for file path / name information. */
  template?: string
  /** The {@link template} when compiled. */
  compiledTemplate?: TemplateDelegate<any>
  /** Additional output files */
  files: string[]?
}

export interface Source {
  path: string
  fileFilterRegexp?: string | RegExp
}
