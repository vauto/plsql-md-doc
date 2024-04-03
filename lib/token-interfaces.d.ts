import { HasPosition, Position, TextSpan } from "./position";

export type TriviaFlag = boolean | 'structured'

export interface TokenLike extends HasPosition {
  /**
   * The name of the group, as passed to compile.
   */
  type?: string | undefined;
  /**
   * The match contents.
   */
  value: string;
  /**
   * The complete match.
   */
  text: string;
  /**
   * Whether this is considered a "trivia" token (e.g., whitespace, comment).
   */
  isTrivia: TriviaFlag;
}

/**
 * For matching tokens.  Arrays indicate `OR` matches.
 */
export type TokenPattern = string | TokenPattern[] | {
  type?: string,
  value?: string,
  /** Indicates this should match end-of-stream / end-of-file. */
  done?: true
}
