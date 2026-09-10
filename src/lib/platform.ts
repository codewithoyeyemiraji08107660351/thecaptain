export const isDespiaNative = () =>
  /despia/i.test(navigator.userAgent);

export const isIOS = () =>
  /iphone|ipad/i.test(navigator.userAgent);

export const isAndroid = () =>
  /android/i.test(navigator.userAgent);

export const getPlatform = () => {
  if (isDespiaNative()) return "despia" as const;
  if (isIOS()) return "ios" as const;
  if (isAndroid()) return "android" as const;
  return "web" as const;
};
