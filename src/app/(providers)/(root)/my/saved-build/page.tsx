"use client";

/* eslint-disable react-hooks/exhaustive-deps */
import { useActiveStore } from "@/store/useActiveTab";
import { useThemeStore } from "@/store/useStore";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../../../../supabase/client";
import { BuildCard } from "./SavedBuildComponents/BuildCard";
import { BuildDetailsPanel } from "./SavedBuildComponents/BuildDetailsPanel";
import build from "next/dist/build";

const CommunityBuilds = () => {
  const [builds, setBuilds] = useState<any[]>([]);
  const [selectedBuild, setSelectedBuild] = useState<any | null>(null); // 선택된 빌드를 저장
  const [selectedBuildPriceMap, setSelectedBuildPriceMap] = useState<
    any | null
  >(null); // 가격 정보 저장
  const [visibleCards, setVisibleCards] = useState<boolean[]>([]); // BuildCard의 표시 상태 관리
  const [loading, setLoading] = useState<boolean>(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState<boolean>(false); // 다음 페이지가 있는지 확인
  const [minPrice, setMinPrice] = useState<number | null>(null); // 최소 가격
  const [maxPrice, setMaxPrice] = useState<number | null>(null); // 최대 가격
  const [selectedCategory, setSelectedCategory] = useState<string>("All"); // 선택된 카테고리 필터
  const [sortBy, setSortBy] = useState<string>("최근견적순"); // 정렬 기준
  const buildsPerPage = 24; // 한 페이지에 표시할 빌드 수
  const theme = useThemeStore((state) => state.theme);
  const activeTab = useActiveStore((state) => state.activeTab);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      setMousePosition({ x: event.clientX, y: event.clientY });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  const tabChange = useRef(true); // useRef로 tabChange 상태 관리

  // 빌드를 가져오는 함수
  const fetchBuilds = async (pageNumber: number) => {
    try {
      setLoading(true);

      // 사용자 정보를 가져와서 userId 추출
      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      let userId: string | null = null;
      if (!userError && userData?.user) {
        userId = userData.user.id;
      }

      let query = supabase
        .from("saved_builds")
        .select("builds(*), uid")
        .eq("uid", userId!)
        .range(
          (pageNumber - 1) * buildsPerPage,
          pageNumber * buildsPerPage - 1
        );

      // 가격 필터 적용
      if (minPrice !== null) {
        query = query.gte("builds.total_price", minPrice * 10000); // 최소 가격 필터
      }
      if (maxPrice !== null) {
        query = query.lte("builds.total_price", maxPrice * 10000); // 최대 가격 필터
      }

      const { data: buildsData, error: buildsError } = await query;

      if (buildsError) {
        console.error("Error fetching builds:", buildsError.message);
        setLoading(false);
        return;
      }

      if (!buildsData || buildsData.length === 0) {
        console.log("No builds found.");
        setLoading(false);
        return;
      }

      // 클라이언트 측에서 정렬 적용 (낮은가격순, 높은가격순, 생성일 순)
      if (sortBy === "낮은가격순") {
        buildsData.sort(
          (a, b) => a.builds?.total_price - b.builds?.total_price
        );
      } else if (sortBy === "높은가격순") {
        buildsData.sort(
          (a, b) => b.builds?.total_price - a.builds?.total_price
        );
      } else {
        buildsData.sort((a, b) => {
          // created_at 필드가 null인지 확인 후 비교
          const dateA = a.builds?.created_at
            ? new Date(a.builds.created_at).getTime()
            : 0;
          const dateB = b.builds?.created_at
            ? new Date(b.builds.created_at).getTime()
            : 0;
          return dateB - dateA; // 최신순으로 정렬
        });
      }

      // 다음 페이지 데이터 확인을 위한 추가 요청 (다음 페이지 데이터가 있는지 확인)
      const nextPageQuery = supabase
        .from("saved_builds")
        .select("builds:build_id(*), uid")
        .range(pageNumber * buildsPerPage, pageNumber * buildsPerPage);

      const { data: nextPageData } = await nextPageQuery;
      setHasNextPage(nextPageData && nextPageData.length > 0);

      // saved_builds 테이블의 데이터를 builds 테이블 형식으로 변환 및 날짜 변환
      const builds = buildsData
        .map((entry) => {
          const build = entry.builds;
          if (!build) return null; // build가 없는 경우 null 처리

          const createdAt = new Date(build.created_at);
          const formattedDate = `${createdAt.getFullYear()}.${(
            createdAt.getMonth() + 1
          )
            .toString()
            .padStart(2, "0")}.${createdAt
            .getDate()
            .toString()
            .padStart(2, "0")}`;
          return { ...build, creationDate: formattedDate };
        })
        .filter((build) => build !== null); // null 값 필터링

      // 이전 데이터를 유지하지 않고 새로운 데이터를 세팅
      setBuilds(builds);

      // visibleCards를 초기화하고 애니메이션 시작
      setVisibleCards(new Array(builds.length).fill(false));

      // 지연을 주면서 하나씩 카드를 표시
      builds.forEach((_, index) => {
        setTimeout(() => {
          setVisibleCards((prev) => {
            const newState = [...prev];
            newState[index] = true;
            return newState;
          });
        }, index * 100); // 카드가 100ms 간격으로 나타나도록 설정
      });

      setLoading(false);
    } catch (error) {
      console.error("Error fetching builds:", error.message);
      setLoading(false);
    }
  };

  // 제품 가격 정보를 조회하는 함수
  const fetchProductPrices = async (buildsData: any[]) => {
    const productNames = buildsData
      .flatMap((build) => [
        build.Case,
        build.Cooler,
        build.CPU,
        build.HDD,
        build.MBoard,
        build.Power,
        build.RAM,
        build.SSD,
        build.VGA,
      ])
      .filter((part) => part !== null);

    const { data: productsData, error: productsError } = await supabase
      .from("products")
      .select("product_name, price")
      .in("product_name", productNames);

    if (productsError || !productsData) {
      throw new Error(
        "Error fetching product prices: " + productsError.message
      );
    }

    return productsData.reduce((acc, product) => {
      acc[product.product_name] = product.price;
      return acc;
    }, {});
  };

  // 빌드의 가격을 계산하는 함수
  const calculateBuildPrice = (
    build,
    productPriceMap: { [x: string]: any }
  ) => {
    const totalPrice = [
      build.Case,
      build.Cooler,
      build.CPU,
      build.HDD,
      build.MBoard,
      build.Power,
      build.RAM,
      build.SSD,
      build.VGA,
    ].reduce((sum, part) => sum + (productPriceMap[part] || 0), 0);

    return { ...build, totalPrice };
  };

  // 상세 정보를 클릭했을 때 빌드 상세 정보를 가져오는 함수
  const handleBuildClick = async (buildId: any) => {
    try {
      setLoading(true);
      console.log("Fetching details for buildId:", buildId); // 로그 추가
      // 선택된 빌드의 상세 정보를 가져옴
      const { data: buildDetails, error: buildDetailsError } = await supabase
        .from("builds")
        .select("*")
        .eq("id", buildId)
        .single();

      if (buildDetailsError) {
        throw new Error(
          "Error fetching build details: " + buildDetailsError.message
        );
      }

      console.log("Build details fetched:", buildDetails); // 로그 추가

      const productsData = await fetchProductPrices([buildDetails]);
      const buildWithPrices = calculateBuildPrice(buildDetails, productsData);

      setSelectedBuild(buildWithPrices); // 선택된 빌드 설정
      setSelectedBuildPriceMap(productsData); // 가격 정보 저장
      setLoading(false);
      console.log("Selected build:", buildWithPrices); // 로그 추가
    } catch (error) {
      setLoading(false);
      console.error("Error fetching build details:", error.message);
    }
  };

  // 삽입하는 거
  const insertBuildData = async () => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error(
        "사용자를 가져오는 중 오류 발생:",
        authError || "사용자가 로그인하지 않았습니다."
      );
      return;
    }

    const uid = user.id;

    let build_id;

    const { data: insertedBuild, error: buildInsertError } = await supabase
      .from("builds")
      .insert([buildData])
      .select();

    if (buildInsertError) {
      console.error("Error inserting build data:", buildInsertError);
      return;
    }

    build_id = insertedBuild[0].id;
    console.log("새로운 build를 삽입했습니다.");

    const { error: savedBuildsError } = await supabase
      .from("saved_builds")
      .insert([{ uid, build_id }]);

    if (savedBuildsError) {
      console.error("Error inserting into saved_builds:", savedBuildsError);
    } else {
      console.log("Build data and saved_builds entry inserted successfully");
    }
  };

  useEffect(() => {
    // activeTab이 "Community Builds"로 변경되고 tabChange.current가 true일 때만 fetchBuilds 실행
    if (activeTab === "Community Builds" && tabChange.current) {
      fetchBuilds(page);
      tabChange.current = false; // 실행 후 한번만 실행되도록 변경
    } else if (activeTab !== "Community Builds" && !tabChange.current) {
      tabChange.current = true; // activeTab이 다른 탭으로 변경되면 다시 true로 변경
    }
  }, [activeTab, page]);

  // 가격 범위와 카테고리 필터 적용 함수
  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setPage(1); // 페이지를 1로 초기화
  };

  useEffect(() => {
    fetchBuilds(page); // 페이지, 필터, 가격 등이 변경될 때 빌드를 가져옴
  }, [page, minPrice, maxPrice, selectedCategory, sortBy]);

  const handlePriceRangeSearch = () => {
    // 페이지를 1로 초기화하고 useEffect에서 자동으로 빌드를 가져오도록 설정
    setPage(1);
  };

  const nextPage = () => {
    if (hasNextPage) {
      tabChange.current = true; //
      setPage((prev) => prev + 1);
    }
  };

  const prevPage = () => {
    if (page > 1) {
      tabChange.current = true; //
      setPage((prev) => prev - 1);
    }
  };

  // 이미지 컴포넌트화
  const ThemeImage = ({ theme, mouseX, mouseY }: any) => {
    // window 객체가 존재하는지 확인하여 클라이언트에서만 실행
    const moveX =
      typeof window !== "undefined"
        ? (mouseX - window.innerWidth / 2) * -0.01
        : 0;
    const moveY =
      typeof window !== "undefined"
        ? (mouseY - window.innerHeight / 2) * -0.01
        : 0;

    return (
      <>
        <div
          // 라이트 모드
          className={`absolute inset-0 bg-gradient-to-r from-gray-400/0 to-gray-400 z-0 pointer-events-none theme-opacity ${
            theme !== "dark" ? "opacity-100" : "opacity-0"
          }`}
        ></div>
        <div
          // 다크 모드
          className={`absolute inset-0 bg-gradient-to-r from-pink-500/0 to-black z-0 pointer-events-none theme-opacity ${
            theme === "dark" ? "opacity-100" : "opacity-0"
          }`}
        ></div>
        <img
          // 라이트 모드
          src="https://image.tmdb.org/t/p/original/x5BwPpYXAEYDgh4RHFnaVSz2Ogi.jpg"
          alt=""
          style={{ transform: `translate(${moveX}px, ${moveY}px)` }}
          className={`absolute inset-0 w-full transform transition-transform duration-500 ease-in-out ${
            theme !== "dark" ? "opacity-100 " : "opacity-0 "
          } pointer-events-none blur-mask`}
        />
        <img
          // 다크 모드
          src="https://i.ibb.co/GPRBP2d/miku.jpg"
          alt=""
          style={{ transform: `translate(${moveX}px, ${moveY}px)` }}
          className={`absolute inset-0 w-full transform transition-transform duration-500 ease-in-out ${
            theme === "dark" ? "opacity-100 " : "opacity-0 "
          } pointer-events-none blur-mask`}
        />
      </>
    );
  };

  const textThemeStyle = theme === "dark" ? "text-white" : "text-black"; // dark 모드일 때 흰색, 아니면 검은색

  const backgroundThemeStyle = theme === "dark" ? "bg-[#0d1117]" : "bg-white";

  const blockedPanelBuildedStyle = loading
    ? "opacity-100 pointer-events-auto "
    : "opacity-0 pointer-events-none ";
  const borderColorThemeStyle =
    theme === "dark" ? "border-gray-300" : "border-[#0d1117]";

  return (
    <div
      className={`${backgroundThemeStyle} relative w-full h-full overflow-hidden`}
    >
      <ThemeImage
        theme={theme}
        mouseX={mousePosition.x}
        mouseY={mousePosition.y}
      />
      <div className="relative w-2/3 h-[98%] pb-[5%] mt-0 mx-auto">
        <section
          className={`${backgroundThemeStyle} ${borderColorThemeStyle} relative h-full border-t border-b py-4 bg-opacity-30 px-2`}
        >
          <div className="w-full h-full overflow-hidden max-h-[100%]">
            <div
              className={`${blockedPanelBuildedStyle} ${backgroundThemeStyle} absolute flex justify-center items-center h-full inset-0 bg-opacity-50 z-40 text-6xl`}
            >
              <span className={`${textThemeStyle}`}>Loading...</span>
            </div>
            {/* BuildDetailsPanel */}
            {selectedBuild && (
              <BuildDetailsPanel
                selectedBuild={selectedBuild}
                productPriceMap={selectedBuildPriceMap} // 가격 정보 전달
                theme={theme}
                onClose={() => setSelectedBuild(null)} // 패널 닫기 기능
                fetchBuilds={() => fetchBuilds(1)}
              />
            )}

            <div className="grid grid-cols-4 gap-4 overflow-y-scroll max-h-[100%] pr-2">
              {builds.map((build, index) => (
                <div
                  key={build.id}
                  className={`transition-all duration-500 ease-out transform ${
                    visibleCards[index]
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 translate-y-10"
                  }`}
                >
                  <BuildCard
                    build={build}
                    theme={theme}
                    creationDate={build.creationDate} // 생성 날짜 전달
                    onClick={() => handleBuildClick(build.id)} // 클릭 시 handleBuildClick 호출
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
        <nav className="flex justify-between mt-4 w-[20%] mx-auto">
          <button
            onClick={prevPage}
            className="px-4 py-2 bg-gray-200 rounded-lg"
            disabled={page === 1}
          >
            {"<"}
          </button>
          <span
            className={`${textThemeStyle} w-3 flex justify-center items-center`}
          >
            {page}
          </span>
          <button
            onClick={nextPage}
            className="px-4 py-2 bg-gray-200 rounded-lg"
            disabled={!hasNextPage}
          >
            {">"}
          </button>
        </nav>
      </div>
    </div>
  );
};

export default CommunityBuilds;
