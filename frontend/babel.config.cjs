module.exports = {
  overrides: [{ test: /\.tsx?$/, presets: ['@babel/preset-typescript'] }],
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
};
