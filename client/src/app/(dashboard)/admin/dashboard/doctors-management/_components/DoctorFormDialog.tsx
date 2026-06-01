import InputFieldError from "@/components/common/InputFieldError";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSpecialtySelection } from "@/hooks/use-specialty-selection";
import {
  createDoctor,
  updateDoctor,
} from "@/app/(dashboard)/admin/dashboard/doctors-management/_services";
import { ISpecialty } from "@/types/specialty.type";
import Image from "next/image";
import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import SpecialtyMultiSelect from "./SpecialtyMultiSelect";
import { IDoctor } from "../_types";

interface IDoctorFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  doctor?: IDoctor;
  specialities?: ISpecialty[];
}

const DoctorFormDialog = ({
  open,
  onClose,
  onSuccess,
  doctor,
  specialities,
}: IDoctorFormDialogProps) => {
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEdit = !!doctor;

  const [gender, setGender] = useState<"MALE" | "FEMALE">(
    doctor?.gender || "MALE",
  );

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setSelectedFile(file || null);
  };

  const [state, formAction, pending] = useActionState(
    isEdit ? updateDoctor.bind(null, doctor.id!) : createDoctor,
    null,
  );

  const prevStateRef = useRef(state);

  const handleClose = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (selectedFile) {
      setSelectedFile(null); // Clear preview
    }
    formRef.current?.reset(); // Clear form
    onClose(); // Close dialog
  };

  const specialtySelection = useSpecialtySelection({
    doctor,
    isEdit,
    open,
  });

  const getSpecialty = (id: string): ISpecialty | undefined => {
    return specialities?.find((s) => s.id === id);
  };

  useEffect(() => {
    if (state === prevStateRef.current) return;
    prevStateRef.current = state;

    if (state?.success) {
      toast.success(state.message);
      if (formRef.current) {
        formRef.current.reset();
      }
      onSuccess();
      onClose();
    } else if (state && !state.success && state.message) {
      toast.error(state.message);

      if (selectedFile && fileInputRef.current) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(selectedFile);
        fileInputRef.current.files = dataTransfer.files;
      }
    }
  }, [state, onSuccess, onClose, selectedFile]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-5 border-b bg-gray-50/50">
          <DialogTitle className="text-xl font-semibold text-gray-800">
            {isEdit ? "Edit Doctor Profile" : "Add New Doctor"}
          </DialogTitle>
        </DialogHeader>

        <form
          ref={formRef}
          action={formAction}
          className="flex flex-col flex-1 min-h-0"
        >
          <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
              {/* --- Personal Information Section --- */}
              <div className="md:col-span-2">
                <h3 className="text-base font-semibold text-primary/90 border-b pb-2 mb-2 flex items-center gap-2">
                  Personal Information
                </h3>
              </div>

              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input
                  id="name"
                  name="name"
                  placeholder="Dr. John Doe"
                  defaultValue={
                    state?.formData?.name || (isEdit ? doctor?.name : "")
                  }
                  className="bg-white"
                />
                <InputFieldError state={state} field="name" />
              </Field>

              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="doctor@example.com"
                  defaultValue={
                    state?.formData?.email || (isEdit ? doctor?.email : "")
                  }
                  disabled={isEdit}
                  className="bg-white disabled:bg-gray-50"
                />
                <InputFieldError state={state} field="email" />
              </Field>

              {!isEdit && (
                <>
                  <Field>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      defaultValue={state?.formData?.password || ""}
                      placeholder="Enter password"
                      className="bg-white"
                    />
                    <InputFieldError state={state} field="password" />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="confirmPassword">
                      Confirm Password
                    </FieldLabel>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      defaultValue={state?.formData?.confirmPassword || ""}
                      placeholder="Confirm password"
                      className="bg-white"
                    />
                    <InputFieldError state={state} field="confirmPassword" />
                  </Field>
                </>
              )}

              <Field>
                <FieldLabel htmlFor="contactNumber">Contact Number</FieldLabel>
                <Input
                  id="contactNumber"
                  name="contactNumber"
                  placeholder="+1234567890"
                  defaultValue={
                    state?.formData?.contactNumber ||
                    (isEdit ? doctor?.contactNumber : "")
                  }
                  className="bg-white"
                />
                <InputFieldError state={state} field="contactNumber" />
              </Field>

              <Field>
                <FieldLabel htmlFor="gender">Gender</FieldLabel>
                <Input
                  id="gender"
                  name="gender"
                  placeholder="Select gender"
                  defaultValue={gender}
                  type="hidden"
                />
                <Select
                  value={gender}
                  onValueChange={(value) =>
                    setGender(value as "MALE" | "FEMALE")
                  }
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Male</SelectItem>
                    <SelectItem value="FEMALE">Female</SelectItem>
                  </SelectContent>
                </Select>
                <InputFieldError state={state} field="gender" />
              </Field>

              <div className="md:col-span-2">
                <Field>
                  <FieldLabel htmlFor="address">Address</FieldLabel>
                  <Input
                    id="address"
                    name="address"
                    placeholder="123 Main St, City, Country"
                    defaultValue={
                      state?.formData?.address ||
                      (isEdit ? doctor?.address : "")
                    }
                    className="bg-white"
                  />
                  <InputFieldError state={state} field="address" />
                </Field>
              </div>

              {/* --- Professional Information Section --- */}
              <div className="md:col-span-2 mt-2">
                <h3 className="text-base font-semibold text-primary/90 border-b pb-2 mb-2">
                  Professional Information
                </h3>
              </div>

              <Field>
                <FieldLabel htmlFor="registrationNumber">
                  Registration Number
                </FieldLabel>
                <Input
                  id="registrationNumber"
                  name="registrationNumber"
                  placeholder="REG123456"
                  defaultValue={
                    state?.formData?.registrationNumber ||
                    (isEdit ? doctor?.registrationNumber : "")
                  }
                  className="bg-white"
                />
                <InputFieldError state={state} field="registrationNumber" />
              </Field>

              <Field>
                <FieldLabel htmlFor="qualification">Qualification</FieldLabel>
                <Input
                  id="qualification"
                  name="qualification"
                  placeholder="MBBS, MD"
                  defaultValue={
                    state?.formData?.qualification ||
                    (isEdit ? doctor?.qualification : "")
                  }
                  className="bg-white"
                />
                <InputFieldError state={state} field="qualification" />
              </Field>

              <Field>
                <FieldLabel htmlFor="experience">
                  Experience (in years)
                </FieldLabel>
                <Input
                  id="experience"
                  name="experience"
                  type="number"
                  placeholder="5"
                  defaultValue={
                    state?.formData?.experience ||
                    (isEdit ? doctor?.experience : "")
                  }
                  min="0"
                  className="bg-white"
                />
                <InputFieldError state={state} field="experience" />
              </Field>

              <Field>
                <FieldLabel htmlFor="designation">Designation</FieldLabel>
                <Input
                  id="designation"
                  name="designation"
                  placeholder="Senior Consultant"
                  defaultValue={
                    state?.formData?.designation ||
                    (isEdit ? doctor?.designation : "")
                  }
                  className="bg-white"
                />
                <InputFieldError state={state} field="designation" />
              </Field>

              <Field>
                <FieldLabel htmlFor="currentWorkingPlace">
                  Current Working Place
                </FieldLabel>
                <Input
                  id="currentWorkingPlace"
                  name="currentWorkingPlace"
                  placeholder="City Hospital"
                  defaultValue={
                    state?.formData?.currentWorkingPlace ||
                    (isEdit ? doctor?.currentWorkingPlace : "")
                  }
                  className="bg-white"
                />
                <InputFieldError state={state} field="currentWorkingPlace" />
              </Field>

              <Field>
                <FieldLabel htmlFor="appointmentFee">
                  Appointment Fee
                </FieldLabel>
                <Input
                  id="appointmentFee"
                  name="appointmentFee"
                  type="number"
                  placeholder="100"
                  defaultValue={isEdit ? doctor?.appointmentFee : undefined}
                  min="0"
                  className="bg-white"
                />
                <InputFieldError state={state} field="appointmentFee" />
              </Field>

              {/* --- Specialties Section --- */}
              <div className="md:col-span-2 mt-2 border-t pt-4">
                <SpecialtyMultiSelect
                  selectedSpecialtyIds={specialtySelection.selectedSpecialtyIds}
                  removedSpecialtyIds={specialtySelection.removedSpecialtyIds}
                  currentSpecialtyId={specialtySelection.currentSpecialtyId}
                  availableSpecialties={specialtySelection.getAvailableSpecialties(
                    specialities!,
                  )}
                  isEdit={isEdit}
                  onCurrentSpecialtyChange={
                    specialtySelection.setCurrentSpecialtyId
                  }
                  onAddSpecialty={specialtySelection.handleAddSpecialty}
                  onRemoveSpecialty={specialtySelection.handleRemoveSpecialty}
                  getSpecialty={getSpecialty}
                  getNewSpecialties={specialtySelection.getNewSpecialties}
                />
                <InputFieldError field="specialties" state={state} />
              </div>

              {!isEdit && (
                <div className="md:col-span-2 mt-2 border-t pt-4">
                  <Field>
                    <FieldLabel htmlFor="file">Profile Photo</FieldLabel>
                    {selectedFile && (
                      <div className="mb-3">
                        <Image
                          src={
                            typeof selectedFile === "string"
                              ? selectedFile
                              : URL.createObjectURL(selectedFile)
                          }
                          alt="Profile Photo Preview"
                          width={80}
                          height={80}
                          className="w-20 h-20 rounded-full object-cover border-2 border-primary/20 shadow-sm"
                        />
                      </div>
                    )}
                    <Input
                      ref={fileInputRef}
                      id="file"
                      name="file"
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="bg-white cursor-pointer file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                    />
                    <p className="text-xs text-gray-500 mt-1.5">
                      Upload a profile photo for the doctor (optional, Max 5MB)
                    </p>
                    <InputFieldError state={state} field="profilePhoto" />
                  </Field>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving..."
                : isEdit
                  ? "Update Doctor"
                  : "Create Doctor"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DoctorFormDialog;
