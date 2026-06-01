import AIDoctorSuggestion from "@/app/(public)/doctors/_components/AIDoctorSuggestion";
import DoctorGrid from "@/app/(public)/doctors/_components/DoctorGrid";
import DoctorSearchFilters from "@/app/(public)/doctors/_components/DoctorSearchFilter";
import TablePagination from "@/components/table/TablePagination";
import { TableSkeleton } from "@/components/table/TableSkeleton";
import { queryStringFormatter } from "@/lib/helpers/formatters";
import { getDoctors } from "@/app/(dashboard)/admin/dashboard/doctors-management/_services";
import { getSpecialities } from "@/app/(dashboard)/admin/dashboard/specialities-management/_services";
import { Suspense } from "react";

// ISR: Revalidate every 10 minutes for doctor listings
export const revalidate = 600;

const DoctorsPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) => {
  const searchParamsObj = await searchParams;
  const queryString = queryStringFormatter(searchParamsObj);

  // Fetch doctors and specialties in parallel
  const [doctorsResponse, specialtiesResponse] = await Promise.all([
    getDoctors(queryString),
    getSpecialities(),
  ]);

  const doctors = doctorsResponse?.data || [];

  console.log("getDoctors", doctors);

  const specialties = specialtiesResponse?.data || [];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-primary mb-4">
            Book Appointments With Top Specialists
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Search, compare, and book appointments in minutes.
          </p>
        </div>

        {/* Filters */}
        <DoctorSearchFilters specialties={specialties} />

        {/* Doctor Grid */}
        <Suspense fallback={<TableSkeleton columns={3} />}>
          <DoctorGrid doctors={doctors} />
        </Suspense>

        {/* Pagination */}
        <TablePagination
          currentPage={doctorsResponse?.meta?.page || 1}
          totalPages={doctorsResponse?.meta?.totalPage || 1}
        />
      </div>
    </div>
  );
};

export default DoctorsPage;
