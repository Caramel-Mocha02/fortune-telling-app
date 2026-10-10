/**
 * 広告の表示枠 (将来用)。
 *
 * 今は何も表示しない。広告サービス (例: Google AdSense) を導入するときに、
 * ここで広告のタグを描画する。ミニゲームのボタンのすぐ近くに置くと誤クリックを
 * 誘う配置として広告の規約に反するおそれがあるため、ゲームの下に余白をあけて置いている。
 */
export function AdSlot({ placement }: { placement: "waiting" }) {
  void placement;
  return null;
}
