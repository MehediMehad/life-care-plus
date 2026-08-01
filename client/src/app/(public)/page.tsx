import Head from "next/head";
import HeroSection from "./_components/HeroSection";
import OurFeatures from "./_components/OurFeatures";
import StepsSolution from "./_components/StepsSolution";

export const dynamic = 'force-dynamic';

// Dynamic import
import nextDynamic from "next/dynamic";

const Specialities = nextDynamic(
  () => import("@/app/(public)/_components/Specialties"),
  {
    loading: () => (
      <div className="h-40 w-full animate-pulse bg-muted rounded-xl mt-8"></div>
    ),
  },
);

const TopRatedDoctors = nextDynamic(
  () => import("@/app/(public)/_components/TopRatedDoctors"),
  {
    loading: () => (
      <div className="h-64 w-full animate-pulse bg-muted rounded-xl mt-8"></div>
    ),
  },
);

const Steps = nextDynamic(() => import("@/app/(public)/_components/Steps"));
const Testimonials = nextDynamic(
  () => import("@/app/(public)/_components/Testimonials"),
);

export default function Home() {
  return (
    <>
      <Head>
        <title>Life Care + - Find Your Perfect Doctor</title>
        <meta
          name="description"
          content="Discover top-rated doctors tailored to your needs with Life Care +. Get personalized recommendations and book appointments effortlessly."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main>
        <HeroSection />
        <OurFeatures />
        <StepsSolution />
        <Specialities />
        <TopRatedDoctors />
        {/* <Steps /> */} {/* StepSolution component ar aita same. */}
        <Testimonials />
      </main>
    </>
  );
}
