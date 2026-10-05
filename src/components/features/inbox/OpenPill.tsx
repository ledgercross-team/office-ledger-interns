import { useQuery } from "@tanstack/react-query";
import { actions } from "astro:actions";
import { withQuery } from "../query";

/** "{n} open" pill in the Inbox hero; shares the ["inbox"] query with the list island. */
function OpenPill({ initial }: { initial: number }) {
  const { data } = useQuery({ queryKey: ["inbox"], queryFn: () => actions.inbox.list.orThrow(), enabled: false });
  const n = data ? data.length : initial;
  return (
    <span className="tabular inline-flex h-10 items-center rounded-xl bg-primary-soft px-3 text-sm font-semibold text-primary" role="status">
      {n} open
    </span>
  );
}
export default withQuery(OpenPill);
