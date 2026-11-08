// Code highlighting themes with every token at WCAG AA contrast (checked against the block background).
const light = {
  plain: {color: '#122033', backgroundColor: '#f4f6f8'},
  styles: [
    {types: ['comment', 'prolog', 'doctype', 'cdata'], style: {color: '#5b6878', fontStyle: 'italic'}},
    {types: ['namespace'], style: {opacity: 0.8}},
    {types: ['string', 'attr-value', 'char', 'inserted'], style: {color: '#a3125b'}},
    {types: ['punctuation', 'operator'], style: {color: '#3d4a5a'}},
    {types: ['entity', 'url', 'symbol', 'number', 'boolean', 'variable', 'constant', 'regex'], style: {color: '#0b6b5f'}},
    {types: ['property', 'attr-name', 'atrule', 'selector'], style: {color: '#0b4f8a'}},
    {types: ['keyword', 'tag', 'builtin'], style: {color: '#00009f'}},
    {types: ['function', 'deleted', 'class-name'], style: {color: '#b0213a'}},
    {types: ['function-variable'], style: {color: '#6f42c1'}},
    {types: ['italic'], style: {fontStyle: 'italic'}},
    {types: ['important', 'bold'], style: {fontWeight: 'bold'}},
  ],
};
const dark = {
  plain: {color: '#abb2bf', backgroundColor: '#282c34'},
  styles: [
    {types: ['comment', 'prolog', 'doctype', 'cdata'], style: {color: '#9da5b4', fontStyle: 'italic'}},
    {types: ['string', 'attr-value', 'char', 'inserted'], style: {color: '#98c379'}},
    {types: ['punctuation', 'operator'], style: {color: '#abb2bf'}},
    {types: ['entity', 'url', 'symbol', 'number', 'boolean', 'constant', 'regex'], style: {color: '#d19a66'}},
    {types: ['property', 'attr-name', 'tag', 'deleted'], style: {color: '#ef8a92'}},
    {types: ['keyword', 'atrule', 'selector'], style: {color: '#e5c07b'}},
    {types: ['function', 'function-variable', 'class-name', 'builtin'], style: {color: '#61afef'}},
    {types: ['variable'], style: {color: '#56b6c2'}},
    {types: ['italic'], style: {fontStyle: 'italic'}},
    {types: ['important', 'bold'], style: {fontWeight: 'bold'}},
  ],
};
module.exports = {light, dark};
