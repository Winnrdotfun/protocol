import { LiteSVM } from "litesvm";

export const setSvmTimeTo = (svm: LiteSVM, time: number) => {
  const clock = svm.getClock();
  clock.unixTimestamp = BigInt(time);
  svm.setClock(clock);
};
