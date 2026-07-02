interface KeyboardLikeEvent {
  shiftKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  which?: number;
  nativeEvent?: {
    isComposing?: boolean;
    keyCode?: number;
    which?: number;
  };
}

export function isImeComposing(event: KeyboardLikeEvent, composingRefValue: boolean) {
  return (
    composingRefValue ||
    event.isComposing === true ||
    event.nativeEvent?.isComposing === true ||
    event.keyCode === 229 ||
    event.which === 229 ||
    event.nativeEvent?.keyCode === 229 ||
    event.nativeEvent?.which === 229
  );
}

export function shouldSubmitOnEnter(event: KeyboardLikeEvent, composingRefValue: boolean) {
  return !event.shiftKey && !isImeComposing(event, composingRefValue);
}
