import { renderOperations } from "../render";
export const dynamic = "force-dynamic";

export default async function Page() {
  return renderOperations("finance");
}
