const { SyntaxNode, SyntaxNodeFactory } = require('../syntax')

class JavadocSyntaxNodeFactory extends SyntaxNodeFactory {

  /**
   * @param  {...{Token | Token[]}} tokens
   * @returns {SyntaxNode}
   */
  create(...tokens) {
    switch (tokens[0].type) {
      case 'tag':
        console.log('tag', tokens[0])
        break
    }

    return super.create(...tokens)
  }
}



exports.JavadocSyntaxNodeFactory = JavadocSyntaxNodeFactory

