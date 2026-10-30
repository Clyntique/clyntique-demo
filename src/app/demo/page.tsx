import type { Metadata } from "next";
import { InteractiveYcDemo } from "@/components/demo/interactive-yc-demo";

export const metadata: Metadata = {
  title: "Interactive Demo · Clyntique",
  description:
    "Explore Clyntique's client submission and agency compliance review workflow in an interactive sandbox.",
};

export default function DemoPage() {
  return <InteractiveYcDemo />;
}
