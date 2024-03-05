const { Tokenizer } = require('../lexer')

/**
 * @typedef {moo.Token} Token
 * @exports Token
 */

class PlsqlTokenizer extends Tokenizer {

  static #lexerData = {
    default: {
      whitespace: { match: /[ \t\r\n]+/, lineBreaks: true },
      dashdash: {
        match: '--',
        type: () => 'comment.single.start',
        push: 'scomment'
      },

      // PL/SQL is so old it supports "REM" as a keyword for a comment.
      rem: {
        match: /\b[Rr][Ee][Mm]\b/,
        type: () => 'comment.single.start',
        push: 'scomment',
      },

      identifier: [
        {
          match: /[a-zA-Z_][a-zA-Z0-9_#$]*/,
          type: Tokenizer.kwCaseInsensitiveTransform({
             reserved: ["ALL","ALTER","AND","ANY","AS","ASC","AT","BEGIN","BETWEEN","BY","CASE","CHECK","CLUSTERS","CLUSTER","COLAUTH","COLUMNS","COMPRESS","CONNECT","CRASH","CREATE","CURSOR","DECLARE","DEFAULT","DESC","DISTINCT","DROP","ELSE","END","EXCEPTION","EXCLUSIVE","FETCH","FOR","FROM","FUNCTION","GOTO","GRANT","GROUP","HAVING","IDENTIFIED","IF","IN","INDEX","INDEXES","INSERT","INTERSECT","INTO","IS","LIKE","LOCK","MINUS","MODE","NOCOMPRESS","NOT","NOWAIT","NULL","OF","ON","OPTION","OR","ORDER","OVERLAPS","PROCEDURE","PUBLIC","RESOURCE","REVOKE","SELECT","SHARE","SIZE","SQL","START","SUBTYPE","TABAUTH","TABLE","THEN","TO","TYPE","UNION","UNIQUE","UPDATE","VALUES","VIEW","VIEWS","WHEN","WHERE","WITH"],
             keyword: ["A","ADD","ACCESSIBLE","AGENT","AGGREGATE","ARRAY","ATTRIBUTE","AUTHID","AVG","BFILE_BASE","BINARY","BLOB_BASE","BLOCK","BODY","BOTH","BOUND","BULK","BYTE","C","CALL","CALLING","CASCADE","CHAR","CHAR_BASE","CHARACTER","CHARSET","CHARSETFORM","CHARSETID","CLOB_BASE","CLONE","CLOSE","COLLECT","COMMENT","COMMIT","COMMITTED","COMPILED","CONSTANT","CONSTRUCTOR","CONTEXT","CONTINUE","CONVERT","COUNT","CREDENTIAL","CURRENT","CUSTOMDATUM","DANGLING","DATA","DATE","DATE_BASE","DAY","DEFINE","DELETE","DETERMINISTIC","DIRECTORY","DOUBLE","DURATION","ELEMENT","ELSIF","EMPTY","ESCAPE","EXCEPT","EXCEPTIONS","EXECUTE","EXISTS","EXIT","EXTERNAL","FINAL","FIRST","FIXED","FLOAT","FORALL","FORCE","GENERAL","HASH","HEAP","HIDDEN","HOUR","IMMEDIATE","IMMUTABLE","INCLUDING","INDICATOR","INDICES","INFINITE","INSTANTIABLE","INT","INTERFACE","INTERVAL","INVALIDATE","ISOLATION","JAVA","LANGUAGE","LARGE","LEADING","LENGTH","LEVEL","LIBRARY","LIKE2","LIKE4","LIKEC","LIMIT","LIMITED","LOCAL","LONG","LOOP","MAP","MAX","MAXLEN","MEMBER","MERGE","MIN","MINUTE","MOD","MODIFY","MONTH","MULTISET","MUTABLE","NAME","NAN","NATIONAL","NATIVE","NCHAR","NEW","NOCOPY","NUMBER_BASE","OBJECT","OCICOLL","OCIDATE","OCIDATETIME","OCIDURATION","OCIINTERVAL","OCILOBLOCATOR","OCINUMBER","OCIRAW","OCIREF","OCIREFCURSOR","OCIROWID","OCISTRING","OCITYPE","OLD","ONLY","OPAQUE","OPEN","OPERATOR","ORACLE","ORADATA","ORGANIZATION","ORLANY","ORLVARY","OTHERS","OUT","OVERRIDING","PACKAGE","PARALLEL_ENABLE","PARAMETER","PARAMETERS","PARENT","PARTITION","PASCAL","PERSISTABLE","PIPE","PIPELINED","PLUGGABLE","POLYMORPHIC","PRAGMA","PRECISION","PRIOR","PRIVATE","RAISE","RANGE","RAW","READ","RECORD","REF","REFERENCE","RELIES_ON","REMAINDER","RENAME","RESULT","RESULT_CACHE","RETURN","RETURNING","REVERSE","ROLLBACK","ROW","SAMPLE","SAVE","SAVEPOINT","SB1","SB2","SB4","SECOND","SEGMENT","SELF","SEPARATE","SEQUENCE","SERIALIZABLE","SET","SHORT","SIZE_T","SOME","SPARSE","SQLCODE","SQLDATA","SQLNAME","SQLSTATE","STANDARD","STATIC","STDDEV","STORED","STRING","STRUCT","STYLE","SUBMULTISET","SUBPARTITION","SUBSTITUTABLE","SUM","SYNONYM","TDO","THE","TIME","TIMESTAMP","TIMEZONE_ABBR","TIMEZONE_HOUR","TIMEZONE_MINUTE","TIMEZONE_REGION","TRAILING","TRANSACTION","TRANSACTIONAL","TRUSTED","UB1","UB2","UB4","UNDER","UNPLUG","UNSIGNED","UNTRUSTED","USE","USING","VALIST","VALUE","VARIABLE","VARIANCE","VARRAY","VARYING","VOID","WHILE","WORK","WRAPPED","WRITE","YEAR","ZONE"],
             // Somehow "REPLACE" isn't actually a keyword.  Or a reserved word. But "YEAR" is. o_O
             pseudoKeyword: ["REPLACE"]
           }),
           value: s => s.toUpperCase()
        },
        {
          match: /"[^"]+"/,
          value: s => s.slice(1, -1).toUpperCase()
        }
      ],

      number: /[+-]?[0-9]*\.?[0-9]+(?:[Ee][+-]?[0-9]+)?[DFdf]?/,

      string: {
        match: /'(?:\\'|[^'])*'/,
        value: s => s.slice(1, -1).replace(/\\'/g, "'")
      },

      'comment.multi.start': { match: '/*', push: 'mcomment' },

      semicolon: ';',
      period: '.',
      lparen: '(',
      rparen: ')',
      comma: ',',
      slash: '/',
      backslash: '\\',

      char: /./
    },

    scomment: {
      'comment.single.end': { match: "\n", pop: 1, lineBreaks: true },
      'comment.single': {
        match: /.+$/,
        value: s => s.trim()
      }
    },

    mcomment: {
      'comment.multi.end': { match: '*/', pop: 1 },
      'comment.multi': { match: /(?:[^*]|\*(?!\/))+/, lineBreaks: true }
    }
  }

  constructor({ version } = { version: 21 }) {
    super(PlsqlTokenizer.#lexerData)
  }

}

exports.PlsqlTokenizer = PlsqlTokenizer


