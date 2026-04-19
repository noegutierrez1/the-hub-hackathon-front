"use client";

import Lottie from "lottie-react";
import animationData from "@/public/lottie/bag.json";

type LoadingAnimationProps = {
  message?: string;
  className?: string;
  iconClassName?: string;
  messageClassName?: string;
};

export default function LoadingAnimation({
  message = "Loading inventory...",
  className = "",
  iconClassName = "h-40 w-40",
  messageClassName = "mt-4 text-sm font-medium text-slate-500",
}: LoadingAnimationProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-10 ${className}`.trim()}>
      <div className={iconClassName}>
        <Lottie animationData={animationData} loop={true} />
      </div>
      <p className={messageClassName}>{message}</p>
    </div>
  );
}