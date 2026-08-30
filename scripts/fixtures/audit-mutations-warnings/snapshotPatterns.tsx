const unsafeAsyncMutation = useMutation({
  mutationFn: async () => mutateVps(vpsId),
  onMutate: async () => ({
    lockRef: vpsRef,
    mutationGeneration: await chrome.acquireLocalLock(vpsRef, { durable: true }),
  }),
  onSettled: (_data, error, _variables, context) =>
    chrome.settleLocalLock(context.lockRef, error, context.mutationGeneration),
});

const safeAsyncMutation = useMutation({
  mutationFn: async (variables) => mutateVps(variables.vpsId),
  onMutate: async (variables) => {
    const lockRef = objectRef('Vps', variables.vpsId);
    return {
      lockRef,
      mutationGeneration: await chrome.acquireLocalLock(lockRef, { durable: true }),
    };
  },
  onSettled: (_data, error, _variables, context) =>
    chrome.settleLocalLock(context.lockRef, error, context.mutationGeneration),
});

// audit:ignore async-onMutate-without-snapshot-variables
const intentionallyIgnoredAsyncMutation = useMutation({
  mutationFn: async () => mutateVps(vpsId),
  onMutate: async () => ({
    lockRef: vpsRef,
    mutationGeneration: await chrome.acquireLocalLock(vpsRef, { durable: true }),
  }),
  onSettled: (_data, error, _variables, context) =>
    chrome.settleLocalLock(context.lockRef, error, context.mutationGeneration),
});
