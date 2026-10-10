import type { CanvasRenderingTarget2D } from "fancy-canvas";
import type {
  IChartApiBase, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive,
  SeriesAttachedParameter, SeriesType, Time,
} from "lightweight-charts";
import type { ZoneSpec } from "@/lib/analysis/overlays";

/** Draws shaded price zones (FVG, order blocks, S/R, trade boxes) behind the candles, following pan and zoom. */
export class ZonesPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApiBase<Time> | null = null;
  series: ISeriesApi<SeriesType, Time> | null = null;
  zones: ZoneSpec[] = [];
  private requestUpdate: (() => void) | null = null;
  private view = new View(this);

  attached(p: SeriesAttachedParameter<Time>) {
    this.chart = p.chart;
    this.series = p.series;
    this.requestUpdate = p.requestUpdate;
  }

  detached() {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  setZones(z: ZoneSpec[]) {
    this.zones = z;
    this.requestUpdate?.();
  }

  paneViews() {
    return [this.view];
  }

  updateAllViews() {}
}

class View implements IPrimitivePaneView {
  constructor(private p: ZonesPrimitive) {}
  zOrder() {
    return "bottom" as const;
  }
  renderer(): IPrimitivePaneRenderer {
    return new Renderer(this.p);
  }
}

class Renderer implements IPrimitivePaneRenderer {
  constructor(private p: ZonesPrimitive) {}

  draw(target: CanvasRenderingTarget2D) {
    const { chart, series, zones } = this.p;
    if (!chart || !series || zones.length === 0) return;
    const ts = chart.timeScale();
    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr, bitmapSize }) => {
      ctx.save();
      for (const z of zones) {
        const yTop = series.priceToCoordinate(z.top);
        const yBottom = series.priceToCoordinate(z.bottom);
        if (yTop === null || yBottom === null) continue;
        const x1 = ts.timeToCoordinate(z.t1 as Time);
        if (x1 === null) continue;
        const x2 = z.t2 === null ? null : ts.timeToCoordinate(z.t2 as Time);
        const left = Math.max(0, x1 * hr);
        const right = x2 === null ? bitmapSize.width : Math.min(bitmapSize.width, x2 * hr);
        if (right <= left) continue;
        const top = Math.min(yTop, yBottom) * vr;
        const height = Math.max(1, Math.abs(yBottom - yTop) * vr);

        ctx.fillStyle = z.fill;
        ctx.fillRect(left, top, right - left, height);
        ctx.strokeStyle = z.border;
        ctx.lineWidth = Math.max(1, hr);
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(left, top);
        ctx.lineTo(right, top);
        ctx.moveTo(left, top + height);
        ctx.lineTo(right, top + height);
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.fillStyle = z.border;
        ctx.font = `${Math.round(10 * hr)}px sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillText(z.label, left + 4 * hr, top + 2 * vr);
      }
      ctx.restore();
    });
  }
}
