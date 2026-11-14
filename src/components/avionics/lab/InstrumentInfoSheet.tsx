/**
 * "Explain this instrument" side drawer: what it shows, how it works, common errors.
 */
import { AlertTriangle, BookOpen, Cog, Eye } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { INSTRUMENT_INFO, type InstrumentId } from "../instrument-info";

export function InstrumentInfoBody({ id }: { id: InstrumentId }) {
  const info = INSTRUMENT_INFO[id];
  return (
    <div className="space-y-4 text-sm">
      <section>
        <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
          <Eye className="size-3.5" /> What it shows
        </h4>
        <p className="leading-relaxed text-foreground/90">{info.shows}</p>
      </section>
      <section>
        <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
          <Cog className="size-3.5" /> How it works
        </h4>
        <p className="leading-relaxed text-foreground/90">{info.how}</p>
      </section>
      <section>
        <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-caution uppercase">
          <AlertTriangle className="size-3.5" /> Common errors
        </h4>
        <ul className="list-disc space-y-1 pl-5 leading-relaxed text-foreground/90">
          {info.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </section>
      {info.tip ? (
        <p className="rounded-md border border-ok/25 bg-ok/5 px-3 py-2 text-[13px] leading-relaxed">
          <b className="text-ok">Tip: </b>
          {info.tip}
        </p>
      ) : null}
    </div>
  );
}

export function InstrumentInfoSheet({
  id,
  open,
  onOpenChange,
  onSelect,
}: {
  id: InstrumentId;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSelect: (id: InstrumentId) => void;
}) {
  const info = INSTRUMENT_INFO[id];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="size-4 text-primary" /> {info.title}
          </SheetTitle>
          <SheetDescription>
            Explain this instrument — educational overview. Always use the AFM/POH for your
            aircraft.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 px-1">
          <Select value={id} onValueChange={(v) => onSelect(v as InstrumentId)}>
            <SelectTrigger aria-label="Choose an instrument">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(INSTRUMENT_INFO) as InstrumentId[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {INSTRUMENT_INFO[k].title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <InstrumentInfoBody id={id} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
