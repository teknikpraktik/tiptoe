// Spik 2 i headless Chromium: jämförelsesidan, utan och med 4× CPU-strypning (ungefär en medelstark telefon). Ersätter inte mätning på telefon.
import { setup } from "./lib.mjs";

const { base, ctx, page, check, done } = await setup({});
try {
  for (const rate of [1, 4]) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    await page.goto(base + "/spike/geometry/");
    await page.getByTestId("run-bench").click();
    await page.getByTestId("bench-json").waitFor({ timeout: 90000 });
    const { rows } = JSON.parse(await page.getByTestId("bench-json").innerText());
    console.log(`CPU ×${rate}`, JSON.stringify(rows.map((r) => ({ lib: r.lib, passed: `${r.passed}/${r.total}`, ms: r.longWalkMs }))));
    const byLib = Object.fromEntries(rows.map((r) => [r.lib, r]));
    check(`clipper2-ts klarar alla fixturer (CPU ×${rate})`, byLib["clipper2-ts"].passed === byLib["clipper2-ts"].total);
    check(`jsts klarar alla fixturer (CPU ×${rate})`, byLib.jsts.passed === byLib.jsts.total);
    check(`lång promenad under 200 ms med clipper2-ts (CPU ×${rate})`, byLib["clipper2-ts"].longWalkMs < 200, `${byLib["clipper2-ts"].longWalkMs} ms`);
  }
} catch (e) {
  check("oväntat fel", false, String(e));
} finally {
  await done();
}
