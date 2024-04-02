export interface Config {
  /** Config options */
  options: Options
}

import { TemplateDelegate } from "handlebars"

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
  compiledTemplate?: TemplateDelegate<any>
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
}
