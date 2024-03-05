const { SyntaxNode, SyntaxNodeFactory } = require('../syntax')

class JavadocSyntaxNodeFactory extends SyntaxNodeFactory {

  /**
   * @param  {...{Token | Token[]}} tokens
   * @returns {SyntaxNode}
   */
  create(...tokens) {
    return super.create(...tokens)
  }
}

exports.JavadocSyntaxNodeFactory = JavadocSyntaxNodeFactory
