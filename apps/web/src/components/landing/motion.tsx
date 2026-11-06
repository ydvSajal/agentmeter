"use client";
import { useEffect } from "react";
import { gsap } from "gsap";
export function LandingMotion() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observers: IntersectionObserver[] = [];
    const context = gsap.context(() => {
      gsap.fromTo(
        ".landing-hero > h1, .landing-hero > p, .hero-actions",
        { y: 22, opacity: 0.2 },
        {
          y: 0,
          opacity: 1,
          stagger: 0.09,
          duration: 0.7,
          ease: "power3.out",
          clearProps: "all",
        },
      );
      gsap.fromTo(
        ".folder-tabs button",
        { y: 26 },
        {
          y: 0,
          stagger: 0.09,
          duration: 0.9,
          ease: "power3.out",
          clearProps: "all",
        },
      );
      document.querySelectorAll(".landing-reveal").forEach((element) => {
        const observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              gsap.fromTo(
                element,
                { y: 24, opacity: 0.25 },
                {
                  y: 0,
                  opacity: 1,
                  duration: 0.7,
                  ease: "power3.out",
                  clearProps: "all",
                },
              );
              observer.disconnect();
            }
          },
          { threshold: 0.1 },
        );
        observer.observe(element);
        observers.push(observer);
      });
    });
    return () => {
      observers.forEach((observer) => observer.disconnect());
      context.revert();
    };
  }, []);
  return null;
}
