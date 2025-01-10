import { Carousel } from "./carousel.js";

const slideElements = Array(20)
  .fill(0)
  .map((_, index) => {
    const slide = document.createElement("div");
    slide.classList.add("slide");
    // slide.innerHTML = `Slide ${index}`;
    const img = document.createElement("img");
    img.src = `https://picsum.photos/id/${index}/200/200`;
    slide.appendChild(img);
    return slide;
  });

const carousel = new Carousel({
  el: document.querySelector(".carousel"),
  visibleSlideRatio: 0.7,
  visibleSlideCount: 5,
  initialActiveIndex: 10,
  transitionDuration: 400,
  slideElements,
  slideDimensions: { width: 200, height: 200 },
});

window._c = carousel;
