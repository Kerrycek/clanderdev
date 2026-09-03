const standardGuard = useMutation({
  onMutate: () => chrome.acquireLocalLock(vpsRef, { durable: true }),
  onSuccess: (result) => {
    const actionStateId = getMetaActionStateId(result.meta);
    chrome.trackActionState(actionStateId, { object: vpsRef });
  },
  onSettled: (_data, error) => chrome.settleLocalLock(vpsRef, error),
});

const customGuard = useMutation({
  onMutate: lifetimeMutationGuard.acquire,
  onSuccess: (result) => {
    const actionStateId = getMetaActionStateId(result.meta);
    lifetimeMutationGuard.track(actionStateId);
  },
  onSettled: (_data, error) => lifetimeMutationGuard.settle(error),
});

const extractedGuard = useMutation({
  onMutate: acquireMutationContext,
  onSuccess: (result, _variables, context) => {
    const actionStateId = getMetaActionStateId(result.meta);
    chrome.trackActionState(actionStateId, { object: context.lockRef });
  },
  onSettled: (_data, error, _variables, context) => chrome.settleLocalLock(context.lockRef, error),
});
