/**
 * Valor máximo que tendrá la propiedad brightness en un slide.
 */
const MAX_BRIGHTNESS = 0.7;

/**
 * Valor mínimo que tendrá la propiedad brightness en un slide.
 */
const MIN_BRIGHTNESS = 0.1;

/**
 * Valor máximo de z-index de un slide.
 */
const MAX_ZINDEX = 99;

/**
 * Constante de proporcionalidad utilizada para calcular la velocidad
 * de transición en función del ratio de visibilidad del slide.
 * Un valor más bajo implica transiciones más rápidas.
 */
const SLIDE_TRANSITION_SCALAR = 0.00648;

/**
 * Ajuste del desplazamiento de la base en el denominador de la fórmula
 * de cálculo del ratio de tiempo de transición. Este valor determina
 * cómo se modifica la pendiente de la relación entre el ratio de
 * visibilidad y el tiempo de transición.
 */
const SLIDE_TRANSITION_BASE_OFFSET = 0.676;

/**
 * Numero máximo de slides visibles en la vista previa.
 */
const MAX_VISIBLE_SLIDES = 5;

const MAX_RENDERED_SLIDES = 40;
const MAX_SLIDES_PER_SIDE = Math.floor(MAX_RENDERED_SLIDES / 2);

const SlideDirection = {
  LEFT: "left",
  RIGHT: "right",
};

const CssTokens = {
  CAROUSEL_SLIDES_PERSPECTIVE: "--carousel-slides-perspective",
  CAROUSEL_SLIDE_TRANSITION_DURATION: "--carousel-slide-transition-duration",
  CAROUSEL_SLIDE_TRANSITION_EASING: "--carousel-slide-transition-easing",
  CAROUSEL_SLIDE_X_POSITION: "--carousel-slide-x-position",
  CAROUSEL_SLIDE_Z_POSITION: "--carousel-slide-z-position",
};

const DataTokens = {
  SLIDE_INDEX: "data-slide-index",
};

export const TimingFunctions = {
  SMOOTH_FADE: "cubic-bezier(0.77, 0.05, 0.11, 1.17)",
  SMOOTH_SLIDE_IN: "cubic-bezier(0.77, 0.05, 0.6, 0.78)",
  ACCELERATED_SLIDE: "cubic-bezier(0.85, 0.42, 0.8, 0.75)",
  EASE_OUT: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  EASE_IN: "cubic-bezier(0.42, 0, 1, 1)",
  EASE_IN_OUT: "cubic-bezier(0.42, 0, 0.58, 1)",
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampMin(value, min) {
  return Math.max(value, min);
}

function clampMax(value, max) {
  return Math.min(value, max);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Carousel {
  #slides;
  #visibleSlideRatio;
  #visibleSlideCount;
  #slideDimensions = { width: 0, height: 0 };
  #activeSlideIndex;
  #perspective;
  #perspectiveDepth;
  #timingFunction;
  #transitionDuration;
  #slideTransitionDelay;
  #slideFadeDuration;
  #rAF;
  #performAnimationStep;

  #spinDirection;
  #numberOfSpins = 0;
  #currentNumberOfSpins = 0;

  #headIndex = {
    rendered: 0,
    visible: 0,
  };

  #tailIndex = {
    rendered: 0,
    visible: 0,
  };

  #transitionStrategies = {
    [SlideDirection.LEFT]: () => this.#transitionSlidesToLeft(),
    [SlideDirection.RIGHT]: () => this.#transitionSlidesToRight(),
  };

  constructor({
    el,
    visibleSlideCount = 2,
    initialActiveIndex = 0,
    visibleSlideRatio = 0.7,
    transitionDuration = 200,
    perspective = 1000,
    slideElements = null,
    slideDimensions = { width: 100, height: 100 },
  }) {
    this.containerElement = el;

    if (!el || !(el instanceof HTMLElement)) {
      throw new Error("The provided element is not a valid HTMLElement.");
    }

    this.#slides = slideElements ?? [
      ...this.containerElement.querySelectorAll(".slide"),
    ];

    if (!this.size) {
      throw new Error("No slides were found in the container.");
    }

    this.#visibleSlideRatio = this.#clampVisibleSlideRatio(visibleSlideRatio);
    this.#visibleSlideCount = this.#clampVisibleSlideCount(visibleSlideCount);
    this.#perspective = perspective;
    this.#perspectiveDepth = this.#calculatePerspectiveDepth();
    this.#transitionDuration = transitionDuration;
    [this.#slideTransitionDelay, this.#slideFadeDuration] =
      this.#calculateSlideTimeTransition();
    this.#timingFunction = TimingFunctions.EASE_OUT;
    this.#activeSlideIndex = this.#clampSlideIndex(initialActiveIndex);
    this.#slideDimensions = slideDimensions;

    this.#initializeCarousel();
  }

  set activeSlideIndex(targetSlideIndex) {
    targetSlideIndex = this.#clampSlideIndex(targetSlideIndex);

    if (this.#activeSlideIndex === targetSlideIndex) return;

    if (this.#rAF) {
      cancelAnimationFrame(this.#rAF);
      this.#rAF = null;
    }

    this.#numberOfSpins = Math.abs(this.#activeSlideIndex - targetSlideIndex);
    this.#currentNumberOfSpins = 0;
    this.#spinDirection =
      targetSlideIndex < this.#activeSlideIndex
        ? SlideDirection.LEFT
        : SlideDirection.RIGHT;

    if (this.#numberOfSpins > 1) {
      this.#animateSlideTransition(targetSlideIndex);
    } else {
      this.#transitionToSlide(this.#activeSlideIndex, targetSlideIndex);
    }
  }

  get activeSlideIndex() {
    return this.#activeSlideIndex;
  }

  set perspective(perspective) {
    if (this.#rAF) {
      console.warn(
        "The carousel is already animating. Please wait for the animation to finish before changing the perspective."
      );
      return;
    }

    this.#perspective = perspective;
    this.#perspectiveDepth = this.#calculatePerspectiveDepth();

    this.#setPerspectiveToContainer();

    this.#applySlideTransition(
      this.#getPreviousSlides().slice(-this.#visibleSlideCount),
      SlideDirection.LEFT
    );
    this.#applySlideTransition(
      this.#getNextSlides().slice(0, this.#visibleSlideCount),
      SlideDirection.RIGHT
    );
  }

  get perspective() {
    return this.#perspective;
  }

  set transitionDuration(transitionDuration) {
    this.#transitionDuration = transitionDuration;
    [this.#slideTransitionDelay, this.#slideFadeDuration] =
      this.#calculateSlideTimeTransition();

    this.#setTransitionDurationToContainer();
  }

  get transitionDuration() {
    return this.#transitionDuration;
  }

  set timingFunction(timingFunction) {
    this.#timingFunction = timingFunction;
    this.#setTimingFunctionToContainer();
  }

  get timingFunction() {
    return this.#timingFunction;
  }

  get size() {
    return this.#slides.length;
  }

  spinLeft() {
    this.activeSlideIndex = this.#activeSlideIndex - 1;
  }

  spinRight() {
    this.activeSlideIndex = this.#activeSlideIndex + 1;
  }

  spinToEnd() {
    this.activeSlideIndex = this.size - 1;
  }

  spinToStart() {
    this.activeSlideIndex = 0;
  }

  stop() {
    if (this.#rAF) {
      cancelAnimationFrame(this.#rAF);
      this.#rAF = null;
    }
  }

  #calculatePerspectiveDepth() {
    return this.#perspective * 0.1;
  }

  #calculateSlideTimeTransition() {
    /**
     * Entre mas grande sea el ratio de visibilidad del slide, menor sera el ratio de tiempo de transicion
     * Por ejemplo: si el ratio de visibilidad es 1, el ratio de tiempo de transicion sera 0.02. Estos son
     * los valores maximos y minimos que puede tomar.
     *
     * El valor maximo de visibleSlideRatio es de 1, y el minimo es de 0.7.
     *
     * visibleSlideRatio | 1    | 0.9  | 0.8  | 0.7
     * ratio             | 0.02 | 0.07 | 0.14 | 0.27
     */
    const ratio =
      SLIDE_TRANSITION_SCALAR /
      (this.#visibleSlideRatio - SLIDE_TRANSITION_BASE_OFFSET);
    const transitionDelay = this.#transitionDuration * ratio;
    const fadeDuration =
      this.#transitionDuration + this.#transitionDuration * ratio;
    return [transitionDelay, fadeDuration];
  }

  #animateSlideTransition(targetSlideIndex) {
    const stepDirection = targetSlideIndex > this.#activeSlideIndex ? 1 : -1;
    const transitionDirection = this.#determineSlideDirection(targetSlideIndex);
    let currentSlideIndex = this.#activeSlideIndex;

    let lastTimestamp = 0;

    this.#performAnimationStep = () => {
      const currentTimestamp = performance.now();
      const elapsedTime = currentTimestamp - lastTimestamp;

      if (elapsedTime > this.#slideFadeDuration) {
        this.#transitionToSlide(currentSlideIndex, targetSlideIndex, true);
        currentSlideIndex += stepDirection;
        lastTimestamp = currentTimestamp;
      }

      const isLeftDirection = transitionDirection === SlideDirection.LEFT;
      const canAnimate =
        (isLeftDirection && currentSlideIndex >= targetSlideIndex) ||
        (!isLeftDirection && currentSlideIndex <= targetSlideIndex);

      if (canAnimate) {
        this.#rAF = requestAnimationFrame(this.#performAnimationStep);
      } else {
        cancelAnimationFrame(this.#rAF);
        this.#rAF = null;
      }
    };

    this.#transitionToSlide(
      currentSlideIndex,
      currentSlideIndex + stepDirection
    );
    currentSlideIndex += stepDirection;

    this.#rAF = requestAnimationFrame(this.#performAnimationStep);
  }

  #transitionToSlide(currentSlideIndex, targetSlideIndex, isLargeJump = false) {
    const [previousSlide, nextSlide] = [
      this.#getActiveSlide(),
      this.#slides[isLargeJump ? currentSlideIndex : targetSlideIndex],
    ];
    const transitionDirection = this.#determineSlideDirection(targetSlideIndex);

    this.#activeSlideIndex = isLargeJump ? currentSlideIndex : targetSlideIndex;

    this.#applyDelayedTransition(transitionDirection, previousSlide, nextSlide);
  }

  async #applyDelayedTransition(direction, previousSlide, nextSlide) {
    const { immediate, delayed } = this.#getTransitionDirections(direction);
    this.#transitionSlides(immediate);

    await delay(this.#slideTransitionDelay);

    this.#transitionSlides(delayed);
    this.#updateSlideStyles(previousSlide, nextSlide);

    if (this.size > MAX_RENDERED_SLIDES) {
      this.#checkSpinning();
    }
  }

  #getTransitionDirections(referenceDirection) {
    const [immediate, delayed] =
      referenceDirection === SlideDirection.RIGHT
        ? [SlideDirection.LEFT, SlideDirection.RIGHT]
        : [SlideDirection.RIGHT, SlideDirection.LEFT];
    return { immediate, delayed };
  }

  #determineSlideDirection(targetSlideIndex) {
    return targetSlideIndex > this.#activeSlideIndex
      ? SlideDirection.RIGHT
      : SlideDirection.LEFT;
  }

  #clampSlideIndex(index) {
    return clamp(index, 0, this.size - 1);
  }

  #clampVisibleSlideCount(visibleSlideCount) {
    return clamp(visibleSlideCount, 1, MAX_VISIBLE_SLIDES);
  }

  #clampVisibleSlideRatio(visibleSlideRatio) {
    return clamp(visibleSlideRatio, 0.7, 1);
  }

  #updateSlideStyles(previousSlide, newSlide) {
    if (previousSlide) previousSlide.classList.remove("active");
    if (newSlide) {
      newSlide.classList.remove("hidden");
      newSlide.classList.add("active");
      newSlide.style.removeProperty("filter");
      newSlide.style.removeProperty("z-index");
      newSlide.style.removeProperty(CssTokens.CAROUSEL_SLIDE_X_POSITION);
      newSlide.style.removeProperty(CssTokens.CAROUSEL_SLIDE_Z_POSITION);
    }
  }

  #setPerspectiveToContainer() {
    this.containerElement.style.setProperty(
      CssTokens.CAROUSEL_SLIDES_PERSPECTIVE,
      `${this.perspective}px`
    );
  }

  #setTransitionDurationToContainer() {
    this.containerElement.style.setProperty(
      CssTokens.CAROUSEL_SLIDE_TRANSITION_DURATION,
      `${this.transitionDuration}ms`
    );
  }

  #setTimingFunctionToContainer() {
    this.containerElement.style.setProperty(
      CssTokens.CAROUSEL_SLIDE_TRANSITION_EASING,
      `${this.timingFunction}`
    );
  }

  #initializeCarousel() {
    this.#setPerspectiveToContainer();
    this.#setTransitionDurationToContainer();
    this.#setTimingFunctionToContainer();

    const activeSlide = this.#getActiveSlide();

    activeSlide.classList.add("active");

    this.#transitionSlides(SlideDirection.LEFT);
    this.#transitionSlides(SlideDirection.RIGHT);

    this.containerElement.innerHTML = "";

    this.#headIndex.rendered = clampMin(
      this.#activeSlideIndex - MAX_SLIDES_PER_SIDE,
      0
    );

    this.#headIndex.visible = clampMin(
      this.#activeSlideIndex - this.#visibleSlideCount,
      0
    );

    this.#tailIndex.rendered = clampMax(
      this.#activeSlideIndex + MAX_SLIDES_PER_SIDE,
      this.size < MAX_SLIDES_PER_SIDE ? this.size : this.size - 1
    );

    this.#tailIndex.visible = clampMax(
      this.#activeSlideIndex + this.#visibleSlideCount,
      this.size - 1
    );

    const renderedSlides = this.#slides.slice(
      this.#headIndex.rendered,
      this.#tailIndex.rendered + 1
    );

    this.#appendSlides(renderedSlides, this.#headIndex.rendered - 1);

    this.containerElement.addEventListener("click", (event) => {
      if (this.#rAF) return;
      this.#onSlideClick(event);
    });
  }

  #onSlideClick(event) {
    const target = event.target;
    const targetSlide = target.closest(".slide");
    const targetSlideIndex = parseInt(
      targetSlide?.getAttribute(DataTokens.SLIDE_INDEX)
    );

    if (!targetSlide || isNaN(targetSlideIndex)) {
      return;
    }

    this.activeSlideIndex = targetSlideIndex;
  }

  #getActiveSlide() {
    return this.#slides[this.activeSlideIndex];
  }

  #checkSpinning() {
    this.#currentNumberOfSpins++;

    // Salir si estamos en el primer giro y hay más de uno configurado
    if (this.#currentNumberOfSpins === 1 && this.#numberOfSpins > 1) return;

    const isLeftDirection = this.#spinDirection === SlideDirection.LEFT;
    const delta = isLeftDirection ? -1 : 1;

    this.#updateVisibleIndices(delta);

    this.#handleDirection(this.#spinDirection);

    // Reiniciar el contador de giros si ya hemos completado el total
    if (
      this.#currentNumberOfSpins > this.#numberOfSpins ||
      this.#numberOfSpins === 1
    ) {
      this.#currentNumberOfSpins = 0;
    }
  }

  #updateVisibleIndices(delta) {
    this.#headIndex.visible = Math.max(0, this.#headIndex.visible + delta);
    this.#tailIndex.visible = Math.min(
      this.size - 1,
      this.#tailIndex.visible + delta
    );
  }

  #handleDirection(direction) {
    const isLeft = direction === SlideDirection.LEFT;
    const isRight = direction === SlideDirection.RIGHT;

    if (
      (isLeft &&
        this.#headIndex.visible - this.#headIndex.rendered <= 3 &&
        this.#headIndex.rendered > 0) ||
      (isRight &&
        this.#tailIndex.rendered - this.#tailIndex.visible <= 3 &&
        this.#tailIndex.rendered < this.size - 1)
    ) {
      const {
        slidesToAdd,
        slidesToRemove,
        updatedHeadIndex,
        updatedTailIndex,
      } = isLeft
        ? this.#calculateIndicesForLeft()
        : this.#calculateIndicesForRight();

      const refIndex = isLeft
        ? this.#headIndex.rendered
        : this.#tailIndex.rendered;

      this.#headIndex.rendered = updatedHeadIndex;
      this.#tailIndex.rendered = updatedTailIndex;

      if (isLeft) {
        this.#prependSlides(slidesToAdd, refIndex);
      } else {
        this.#appendSlides(slidesToAdd, refIndex);
      }

      this.#removeSlides(slidesToRemove);
    }
  }

  #calculateIndices(direction) {
    const slidesToAddCount =
      MAX_SLIDES_PER_SIDE -
      (direction === -1
        ? this.#activeSlideIndex - this.#headIndex.rendered
        : this.#tailIndex.rendered - this.#activeSlideIndex);

    const slidesToAddStartIndex =
      direction === -1
        ? Math.max(0, this.#headIndex.rendered - slidesToAddCount)
        : this.#tailIndex.rendered + 1;

    const slidesToAddEndIndex =
      direction === -1
        ? this.#headIndex.rendered
        : Math.min(this.#tailIndex.rendered + slidesToAddCount, this.size - 1);

    const slidesToAdd = this.#slides.slice(
      slidesToAddStartIndex,
      slidesToAddEndIndex + (direction === -1 ? 0 : 1)
    );

    const slidesToRemoveStartIndex =
      direction === -1
        ? this.#tailIndex.rendered - slidesToAddCount
        : this.#headIndex.rendered;
    const slidesToRemoveEndIndex =
      direction === -1
        ? this.#tailIndex.rendered + 1
        : this.#headIndex.rendered + slidesToAddCount;
    const slidesToRemove = this.#slides.slice(
      slidesToRemoveStartIndex + (direction === -1 ? 1 : 0),
      slidesToRemoveEndIndex
    );

    return {
      slidesToAdd,
      slidesToRemove,
      updatedHeadIndex:
        direction === -1 ? slidesToAddStartIndex : slidesToRemoveEndIndex,
      updatedTailIndex:
        direction === -1 ? slidesToRemoveStartIndex : slidesToAddEndIndex,
    };
  }

  #calculateIndicesForLeft() {
    return this.#calculateIndices(-1);
  }

  #calculateIndicesForRight() {
    return this.#calculateIndices(1);
  }

  #prependSlides(slides, refIndex) {
    slides.reverse().forEach((slide) => {
      if (!slide.hasAttribute(DataTokens.SLIDE_INDEX)) {
        slide.setAttribute(DataTokens.SLIDE_INDEX, --refIndex);
      }
      this.containerElement.prepend(slide);
    });
  }

  #appendSlides(slides, refIndex) {
    slides.forEach((slide) => {
      if (!slide.hasAttribute(DataTokens.SLIDE_INDEX)) {
        slide.setAttribute(DataTokens.SLIDE_INDEX, ++refIndex);
      }
      this.containerElement.append(slide);
    });
  }

  #removeSlides(slides) {
    slides.forEach((slide) => {
      slide.remove();
    });
  }

  #transitionSlidesToLeft() {
    this.#applySlideTransition(this.#getPreviousSlides(), SlideDirection.LEFT);
  }

  #transitionSlidesToRight() {
    this.#applySlideTransition(this.#getNextSlides(), SlideDirection.RIGHT);
  }

  #applySlideTransition(slides, direction) {
    const visibleSlideWidth =
      this.#slideDimensions.width * this.#visibleSlideRatio;
    const isLeftDirection = direction === SlideDirection.LEFT;
    const slidesToProcess = isLeftDirection ? [...slides].reverse() : slides;

    let translateX = visibleSlideWidth;
    let translateZ = this.#perspectiveDepth;
    let visibleSlideCount = 0;

    for (let index = 0; index < slidesToProcess.length; index++) {
      const slide = slidesToProcess[index];

      if (isLeftDirection) slide.style.removeProperty("z-index");

      if (visibleSlideCount >= this.#visibleSlideCount) {
        if (slide.classList.contains("hidden")) {
          break; // Los slides restantes ya están ocultos, no es necesario procesarlos.
        }

        this.#hideSlide(slide);
        continue;
      }

      const brightness = this.#calculateBrightness(visibleSlideCount);
      this.#showSlide(slide, {
        translateX: isLeftDirection ? -translateX : translateX,
        translateZ: -translateZ,
        brightness,
        zIndex: !isLeftDirection ? MAX_ZINDEX - index : undefined,
      });

      translateX += visibleSlideWidth;
      translateZ += this.#perspectiveDepth;
      visibleSlideCount++;
    }
  }

  #hideSlide(slide) {
    slide.style.removeProperty("filter");
    slide.style.removeProperty(CssTokens.CAROUSEL_SLIDE_X_POSITION);
    slide.style.removeProperty(CssTokens.CAROUSEL_SLIDE_Z_POSITION);
    slide.classList.add("hidden");
  }

  #showSlide(slide, { translateX, translateZ, brightness, zIndex }) {
    slide.classList.remove("hidden");
    slide.style.setProperty(
      CssTokens.CAROUSEL_SLIDE_X_POSITION,
      `${translateX}px`
    );
    slide.style.setProperty(
      CssTokens.CAROUSEL_SLIDE_Z_POSITION,
      `${translateZ}px`
    );
    slide.style.filter = `brightness(${brightness})`;
    if (zIndex !== undefined) slide.style.zIndex = zIndex;
  }

  #calculateBrightness(index) {
    return (
      (MAX_BRIGHTNESS - MIN_BRIGHTNESS) *
        ((this.#visibleSlideCount - 1 - index + 1) / this.#visibleSlideCount) +
      MIN_BRIGHTNESS
    );
  }

  #transitionSlides(direction) {
    const transitionStrategy = this.#transitionStrategies[direction];
    transitionStrategy();
  }

  #getPreviousSlides() {
    return this.#slides.slice(0, this.activeSlideIndex);
  }

  #getNextSlides() {
    return this.#slides.slice(this.activeSlideIndex + 1);
  }
}
