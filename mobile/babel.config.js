module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],   // babel-preset-expo adds the worklets / Reanimated transform itself (Reanimated 4)
  };
};
