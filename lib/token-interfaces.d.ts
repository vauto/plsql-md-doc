import { HasPosition, Position, TextSpan } from "./position";

export type TriviaFlag = boolean | 'structured'

export type TokenFormat = null | '' | 'T' | 'V'

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

  /**
   * Gets the token as a string.
   * @param format How to format the token.
   */
  toString(format?: TokenFormat = ''): string

  /**
   * Gets the full token text as a string.
   * @param format How to format the token.
   */
  toFullString(format?: TokenFormat = ''): string

  /**
   * Gets the relevant data as JSON.
   */
  toJSON(): object
}

/**
 * For matching tokens.  Arrays indicate `OR` matches.
 */
export type TokenPattern = string | TokenPattern[] | {
  type?: string,
  value?: string,
  /** Indicates this should match end-of-stream / end-of-file. */
  done?: true,
  /** Indictes the inverse should be done. */
  inverse?: true
}
