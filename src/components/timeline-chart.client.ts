import * as d3 from "d3";

type Chart = d3.Selection<SVGGElement, unknown, null, undefined>;
type TimeScale = d3.ScaleLinear<number, number>;

interface RenderEvent {
    id: string;
    title: string;
    dateLabel: string;
    key: number;
}

// An event augmented with its wrapped title/date lines and the resulting
// card height, used to vertically center each card on its marker.
interface LaidOutEvent extends RenderEvent {
    titleLines: string[];
    dateLines: string[];
    cardHeight: number;
}

// Layout knobs recomputed each render from the container width, so cards
// fill the available space next to the axis.
interface LayoutConfig {
    cardWidth: number;
    labelMaxWidth: number;
}

const root = document.getElementById("timeline-root");

if (!root) {
    throw new Error("timeline-root not found");
}

const events: RenderEvent[] = JSON.parse(root.dataset.events ?? "[]");

// Minimum vertical pixels between adjacent event markers before they are
// crowded together.
const MIN_MARKER_SPACING = 170;
// Distance from the axis to the card's left edge.
const AXIS_GUTTER = 48;
const MIN_CARD_WIDTH = 160;
const MAX_CARD_WIDTH = 420;
const CARD_PADDING_X = 12;
const CARD_PADDING_Y = 8;
const CARD_RADIUS = 6;
const DATE_LINE_HEIGHT = 12;
const TITLE_LINE_HEIGHT = 16;
// Extra space between the date block and the title block, on top of
// their own line heights.
const BLOCK_GAP = 6;
// Baselines sit at this fraction of each row's line height rather than at
// the top, so text is centered within the space reserved for it.
const BASELINE_RATIO = 0.75;
const CANVAS_PADDING = 16;
// "Nice" round year intervals to snap ticks to.
const YEAR_STEPS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
const TARGET_TICK_SPACING_PX = 110;
// Gaps up to a year apart get proportional spacing; beyond that, spacing
// grows logarithmically so a few centuries-wide outliers don't stretch
// the whole axis and crowd dense clusters together.
const GAP_LINEAR_CAP_DAYS = 400;
const GAP_PIXELS_PER_DAY = 0.6;
const GAP_LOG_SCALE = 40;
const MARGIN = { top: 24, bottom: 24 };
// Reference x for the vertical axis — the canvas is fitted to the rendered
// content afterward, so this doesn't need to be a real coordinate.
const AXIS_X = 0;

// Sizes cards to fill the space next to the axis, measured from the mount
// point so the timeline reads well at any viewport width.
function computeLayoutConfig(): LayoutConfig {
    const containerWidth = root!.clientWidth || window.innerWidth;
    const cardWidth = Math.min(
        MAX_CARD_WIDTH,
        Math.max(MIN_CARD_WIDTH, containerWidth - CANVAS_PADDING * 2 - AXIS_GUTTER),
    );

    return {
        cardWidth,
        labelMaxWidth: cardWidth - CARD_PADDING_X * 2,
    };
}

function compressGap(gapDays: number) {
    const linear = Math.min(gapDays, GAP_LINEAR_CAP_DAYS) * GAP_PIXELS_PER_DAY;
    const overflow = Math.max(gapDays - GAP_LINEAR_CAP_DAYS, 0);
    const compressed = Math.log1p(overflow) * GAP_LOG_SCALE;

    return Math.max(MIN_MARKER_SPACING, linear + compressed);
}

// Positions events along a compressed scale rather than true linear time —
// see compressGap above.
function computeTimeScale(): { y: TimeScale; lastPixel: number } {
    const uniqueKeys = [...new Set(events.map((e) => e.key))];
    const pixelPoints = [MARGIN.top];

    for (let i = 1; i < uniqueKeys.length; i++) {
        const gapDays = uniqueKeys[i] - uniqueKeys[i - 1];
        pixelPoints.push(pixelPoints[i - 1] + compressGap(gapDays));
    }

    const lastPixel = pixelPoints[pixelPoints.length - 1];
    const y = d3.scaleLinear().domain(uniqueKeys).range(pixelPoints);

    return { y, lastPixel };
}

// Samples evenly across the compressed pixel axis rather than picking one
// year step for the whole (possibly huge) domain — each sample snaps to a
// "nice" step sized to how compressed that part of the axis is, so dense
// clusters get fine ticks and empty spans get coarse ones instead of a
// single tick count starving both.
function computeTickYears(y: TimeScale, lastPixel: number): number[] {
    const sampleCount = Math.max(
        2,
        Math.round((lastPixel - MARGIN.top) / TARGET_TICK_SPACING_PX),
    );
    const tickYearSet = new Set<number>();

    for (let i = 0; i <= sampleCount; i++) {
        const pixel = MARGIN.top + (i * (lastPixel - MARGIN.top)) / sampleCount;
        const sampleKey = y.invert(pixel);
        const neighborKey = y.invert(pixel + TARGET_TICK_SPACING_PX);
        const localSpanYears = Math.max(1, Math.abs(neighborKey - sampleKey) / 365);
        const localStep =
            YEAR_STEPS.find((step) => step >= localSpanYears) ??
            YEAR_STEPS[YEAR_STEPS.length - 1];

        tickYearSet.add(Math.round(sampleKey / 365 / localStep) * localStep);
    }

    return [...tickYearSet].sort((a, b) => a - b);
}

// Wraps text into lines no wider than labelMaxWidth by measuring a
// scratch text node; returns the lines without placing any visible tspans.
// className picks which real CSS class to measure with, so wrapping
// matches whichever font the text will actually render with.
function wrapLines(
    chart: Chart,
    text: string,
    className: string,
    labelMaxWidth: number,
) {
    const scratch = chart
        .append("text")
        .attr("class", className)
        .style("opacity", 0);
    const words = text.split(/\s+/).filter(Boolean).reverse();
    const lines: string[] = [];
    let line: string[] = [];
    let word: string | undefined;

    while ((word = words.pop())) {
        line.push(word);
        scratch.text(line.join(" "));

        if (
            line.length > 1 &&
            scratch.node()!.getComputedTextLength() > labelMaxWidth
        ) {
            line.pop();
            lines.push(line.join(" "));
            line = [word];
        }
    }

    lines.push(line.join(" "));
    scratch.remove();

    return lines;
}

// Wraps each event's title/date up front so card height (and therefore
// lane spacing) accounts for however many lines they take.
function layoutEvents(chart: Chart, config: LayoutConfig): LaidOutEvent[] {
    return events.map((timelineEvent) => {
        const titleLines = wrapLines(
            chart,
            timelineEvent.title,
            "event-card-title",
            config.labelMaxWidth,
        );
        const dateLines = wrapLines(
            chart,
            timelineEvent.dateLabel,
            "event-card-date",
            config.labelMaxWidth,
        );
        const cardHeight =
            CARD_PADDING_Y * 2 +
            dateLines.length * DATE_LINE_HEIGHT +
            BLOCK_GAP +
            titleLines.length * TITLE_LINE_HEIGHT;

        return { ...timelineEvent, titleLines, dateLines, cardHeight };
    });
}

// Year ticks can round outward past the event domain (e.g. the last event
// falling mid-year rounds up to the next year boundary), so the axis line
// needs to reach whichever is furthest: the events or the ticks.
function drawAxis(chart: Chart, y: TimeScale, tickYears: number[], lastPixel: number) {
    const lineY1 = Math.min(MARGIN.top, y(tickYears[0] * 365 + 1));
    const lineY2 = Math.max(lastPixel, y(tickYears[tickYears.length - 1] * 365 + 1));

    chart
        .append("line")
        .attr("x1", AXIS_X)
        .attr("x2", AXIS_X)
        .attr("y1", lineY1)
        .attr("y2", lineY2)
        .attr("stroke", "var(--color-gold)")
        .attr("stroke-width", 1);

    const yearTick = chart
        .append("g")
        .attr("class", "timeline-axis")
        .selectAll("g.year-tick")
        .data(tickYears)
        .join("g")
        .attr("class", "year-tick")
        .attr(
            "transform",
            (year: number) => `translate(${AXIS_X}, ${y(year * 365 + 1)})`,
        );

    yearTick.append("line").attr("x1", -4).attr("x2", 4);
    yearTick
        .append("text")
        .attr("x", -8)
        .attr("y", 3)
        .attr("text-anchor", "end")
        .text((year: number) => `S.${year}`);
}

// Renders one block of wrapped lines (a card's date or title) as centered
// tspans, stacked downward from blockTop.
function drawTextBlock(
    group: d3.Selection<SVGGElement, unknown, null, undefined>,
    className: string,
    lines: string[],
    xCenter: number,
    blockTop: number,
    lineHeight: number,
) {
    group
        .selectAll<SVGTextElement, string>(`text.${className}`)
        .data(lines)
        .join("text")
        .attr("class", className)
        .attr("x", xCenter)
        .attr(
            "y",
            (_line, lineIndex) => blockTop + lineIndex * lineHeight + lineHeight * BASELINE_RATIO,
        )
        .attr("text-anchor", "middle")
        .text((line) => line);
}

// Event groups: a dot on the axis, a connector line, and a card that
// floats to the right of the axis.
function drawEvents(
    chart: Chart,
    y: TimeScale,
    laidOut: LaidOutEvent[],
    config: LayoutConfig,
) {
    const marker = chart
        .selectAll("g.event")
        .data(laidOut)
        .join("g")
        .attr("class", "event")
        .attr(
            "transform",
            (timelineEvent: LaidOutEvent) =>
                `translate(${AXIS_X}, ${y(timelineEvent.key)})`,
        );

    marker
        .append("line")
        .attr("class", "lane-line")
        .attr("x1", 0)
        .attr("x2", AXIS_GUTTER)
        .attr("y1", 0)
        .attr("y2", 0);

    marker.append("circle").attr("class", "event-marker").attr("r", 4);

    const card = marker
        .append("g")
        .attr("class", "event-card")
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr(
            "aria-label",
            (timelineEvent: LaidOutEvent) =>
                `${timelineEvent.title}, ${timelineEvent.dateLabel}`,
        )
        .on("click", (_event: MouseEvent, timelineEvent: LaidOutEvent) => {
            window.dispatchEvent(
                new CustomEvent("timeline:select", { detail: timelineEvent }),
            );
        })
        .on("keydown", (event: KeyboardEvent, timelineEvent: LaidOutEvent) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                window.dispatchEvent(
                    new CustomEvent("timeline:select", { detail: timelineEvent }),
                );
            }
        });

    const xCenter = AXIS_GUTTER + config.cardWidth / 2;

    card.append("rect")
        .attr("class", "event-card-bg")
        .attr("x", AXIS_GUTTER)
        .attr("width", config.cardWidth)
        .attr("y", (timelineEvent: LaidOutEvent) => -timelineEvent.cardHeight / 2)
        .attr("height", (timelineEvent: LaidOutEvent) => timelineEvent.cardHeight)
        .attr("rx", CARD_RADIUS);

    card.each(function (timelineEvent: LaidOutEvent) {
        const group = d3.select(this);
        const contentTop = -timelineEvent.cardHeight / 2 + CARD_PADDING_Y;
        const titleBlockTop =
            contentTop + timelineEvent.dateLines.length * DATE_LINE_HEIGHT + BLOCK_GAP;

        drawTextBlock(
            group,
            "event-card-date",
            timelineEvent.dateLines,
            xCenter,
            contentTop,
            DATE_LINE_HEIGHT,
        );
        drawTextBlock(
            group,
            "event-card-title",
            timelineEvent.titleLines,
            xCenter,
            titleBlockTop,
            TITLE_LINE_HEIGHT,
        );
    });
}

// Fits the canvas to the rendered content instead of guessing fixed
// dimensions, since un-truncated, wrapped labels vary in size.
function fitCanvas(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    chart: Chart,
) {
    const bbox = (chart.node() as SVGGElement).getBBox();
    const canvasWidth = bbox.width + CANVAS_PADDING * 2;
    const canvasHeight = bbox.height + CANVAS_PADDING * 2;

    chart.attr(
        "transform",
        `translate(${CANVAS_PADDING - bbox.x}, ${CANVAS_PADDING - bbox.y})`,
    );
    svg.attr("width", canvasWidth)
        .attr("height", canvasHeight)
        .attr("viewBox", `0 0 ${canvasWidth} ${canvasHeight}`);
}

function render() {
    root!.innerHTML = "";

    const config = computeLayoutConfig();
    const { y, lastPixel } = computeTimeScale();
    const tickYears = computeTickYears(y, lastPixel);

    const svg = d3.select(root).append("svg");
    const chart = svg.append("g").attr("class", "chart-content");

    const laidOut = layoutEvents(chart, config);

    drawAxis(chart, y, tickYears, lastPixel);
    drawEvents(chart, y, laidOut, config);

    fitCanvas(svg, chart);
}

render();

let resizeTimer: ReturnType<typeof setTimeout>;

window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
});

